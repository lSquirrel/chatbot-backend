import express from 'express';
import OpenAI from 'openai';
import tunnel, { HttpsOverHttpOptions } from 'tunnel';
import { Response, Request } from "express";
import { ChatCompletionMessageParam } from 'openai/resources';

const app = express();
const port = 3000;

app.use(express.json());
// 设置允许跨域的域名，*代表允许任意域名跨域, 给移动端使用
app.all("*", function (req, res, next) {
    // 设置允许跨域的域名，*代表允许任意域名跨域
    res.header("Access-Control-Allow-Origin", "*");
    // 允许的header类型
    res.header("Access-Control-Allow-Headers", "*");
    // 跨域允许的请求方式
    res.header("Access-Control-Allow-Methods", "DELETE,PUT,POST,GET,OPTIONS");
    if (req.method.toLowerCase() == "options") { res.send(200); } // 让options尝试请求快速结束
    else { next(); }
});

// 设置openAiApiKey
app.post('/apiKey', (req, res) => {
    setApiKey(req, res);
    res.json({
        status: 200,
    })
})
// 对话路由
app.post('/chat', (req, res) => {
    return chat(req, res);
});
// 聊天记录
app.get('/messages', (req, res) => {
    res.json({
        data: getMessages(),
        status: 200,
    })
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

interface Message {
    id: string,
    createdAt: number,
    createdBy: string, // 对话创建人
    role: string, // 发送这角色：user assistant
    content: string | null // 消息内容
}
const history: ChatCompletionMessageParam[] = []; // 问答记录：openai格式
const messages: Message[] = []; // 回答记录：数据，返回给前端

// 初始化openai
let openai: OpenAI;

function setApiKey(req: Request, res: Response) {
    const { apiKey } = req.body || {};
    if (!apiKey) {
        throw new Error('apiKey is required');
    }
    openai = new OpenAI({
        apiKey, // openai api key
        httpAgent: createHTTPAgent(), // 代理本地vpn
    });
}

/**
 * 对话实现
 * @param req 
 * @param Response 
 */
async function chat(req: Request, Response: Response) {
    const { id, content, createdAt, createdBy } = req.body || {};
    if (!content) {
        throw new Error('Content is required');
    }
    if (!openai) {
        throw new Error('apiKey is required');
    }

    const currChatMsg: ChatCompletionMessageParam = { role: 'user', content };
    const currMsg = { id, createdAt, createdBy, role: 'user', content };
    history.push(currChatMsg);
    messages.push(currMsg);
    const stream = await openai.beta.chat.completions.stream({
        model: 'gpt-3.5-turbo', // 模型
        messages: [
            ...history
        ],
        stream: true,
    });

    stream.on('content', (delta, snapshot) => {
        process.stdout.write(delta);
    });

    for await (const chunk of stream) {
        Response.write(Buffer.from(chunk.choices[0].delta.content || '', "utf-8"));
    }

    const chatCompletion = await stream.finalChatCompletion();
    const replyData = chatCompletion && chatCompletion.choices && chatCompletion.choices[0] && chatCompletion.choices[0].message;
    history.push(replyData);
    messages.push({
        id: id + 'reply',
        createdAt: Date.now(),
        createdBy: createdBy,
        role: replyData.role,
        content: replyData.content && replyData.content.toString()
    });
    Response.end();
}

/**
 * 获取聊天记录
 * 
 */
function getMessages() {
    return messages;
}

/**
 * 代理本地vpn
 * @returns 
 */
function createHTTPAgent() {
    const options: HttpsOverHttpOptions = {
        proxy: {
            host: '127.0.0.1',
            port: 4780,
        },
    };
    return tunnel.httpsOverHttp(options);
}