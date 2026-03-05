export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const apiKey = req.headers['x-gemini-api-key'] || req.body.apiKey;
        if (!apiKey) {
            return res.status(401).json({ error: 'API 키가 입력되지 않았습니다. 서비스 사용을 위해 Gemini API 키를 설정해 주세요.' });
        }

        const { model, body } = req.body;
        const modelName = model || 'gemini-2.5-flash-lite';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('API proxy error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
