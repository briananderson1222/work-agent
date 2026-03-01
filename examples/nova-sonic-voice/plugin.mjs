/**
 * Nova Sonic Voice — server module
 *
 * Exposes a WebSocket endpoint that acts as a relay between the browser and
 * AWS Bedrock's InvokeModelWithBidirectionalStream API (HTTP/2, which cannot
 * be called from browser JS).
 *
 * WS /api/plugins/nova-sonic-voice/relay
 *
 * Required IAM permission: bedrock:InvokeModelWithBidirectionalStream
 */

export default function register(app, { config, logger }) {
  // WebSocket upgrade handler
  app.get('/relay', async (c) => {
    const upgrade = c.req.header('upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return c.text('WebSocket required', 426);
    }

    const region = config.get('region') || process.env.AWS_REGION || 'us-east-1';
    const modelId = config.get('model') || 'us.amazon.nova-lite-v1:0';

    // Dynamic import so the plugin only loads AWS SDK when actually used
    const { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    ).catch(() => {
      logger.error('Nova Sonic: @aws-sdk/client-bedrock-runtime not installed');
      return {};
    });

    if (!BedrockRuntimeClient) {
      return c.text('AWS SDK not available', 503);
    }

    // Note: actual WebSocket upgrading depends on the server framework.
    // This is a placeholder — real implementation wraps the WS ↔ HTTP/2 bridge.
    logger.info('Nova Sonic relay: WS upgrade requested', { modelId, region });

    // TODO: implement full WS ↔ Bedrock bridge when framework supports WS upgrade
    return c.text('Nova Sonic relay not yet fully implemented', 501);
  });
}
