export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, systemPrompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Add system prompt as first message
    const allMessages = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1p1beta1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: allMessages,
          generationConfig: {
            maxOutputTokens: 512,
          }
        }),
      }
    );

    const responseText = await response.text();
    console.log('Gemini raw response:', responseText);

    if (!response.ok) {
      console.error('Gemini error:', responseText);
      return res.status(response.status).json({ 
        error: responseText || 'API error' 
      });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('JSON parse error:', e);
      return res.status(500).json({ error: 'Invalid response from Gemini API' });
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Unexpected response structure:', data);
      return res.status(500).json({ error: 'Unexpected response structure from Gemini' });
    }

    const reply = data.candidates[0].content.parts[0].text;
    
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
