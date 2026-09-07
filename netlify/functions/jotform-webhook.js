exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const data = Object.fromEntries(params);
    
    console.log('New payment received:', JSON.stringify(data, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook received' })
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
