const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID || '';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // Root
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'meta-go-api', version: '0.1.0' }));
    return;
  }

  // ===== WEBHOOK VERIFICATION (GET) =====
  // Meta sends a GET request with hub.mode, hub.verify_token, hub.challenge
  if (url.pathname === '/webhook' && req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.warn('Webhook verification failed — token mismatch');
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    }
    return;
  }

  // ===== WEBHOOK EVENTS (POST) =====
  // Meta sends incoming messages here
  if (url.pathname === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      // Always respond 200 quickly so Meta doesn't retry
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'received' }));

      try {
        const data = JSON.parse(body);
        console.log('Webhook event:', JSON.stringify(data, null, 2));

        // Extract message from the webhook payload
        const entry = data.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.messages?.[0]) {
          const message = value.messages[0];
          const from = message.from; // sender phone number
          const msgBody = message.text?.body || '';
          const msgType = message.type;

          console.log(`Message from ${from}: [${msgType}] ${msgBody}`);

          // Echo reply for now — replace with Claude API later
          if (msgType === 'text' && msgBody) {
            await sendWhatsAppMessage(from, `Echo: ${msgBody}`);
          }
        }
      } catch (err) {
        console.error('Error processing webhook:', err.message);
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Send a text message via WhatsApp Cloud API
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    console.error('WhatsApp API error:', JSON.stringify(result));
  } else {
    console.log('Message sent to', to, '— id:', result.messages?.[0]?.id);
  }
  return result;
}

server.listen(PORT, () => {
  console.log(`meta-go-api running on port ${PORT}`);
});
