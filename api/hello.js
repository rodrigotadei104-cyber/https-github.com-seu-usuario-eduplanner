export default function handler(req, res) {
    res.status(200).json({
        message: 'Hello from Serverless Function!',
        env: process.env.GEMINI_API_KEY ? 'Key Present' : 'Key Missing'
    });
}
