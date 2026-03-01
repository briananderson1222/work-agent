/**
 * ElevenLabs Voice plugin — client bundle entry point.
 *
 * Called by the plugin loader when the bundle is executed. Registers both
 * STT and TTS providers into the voiceRegistry.
 *
 * The plugin loader injects `stallion.apiBase` via a global before running
 * this bundle.
 */
import { voiceRegistry } from '@stallion-ai/sdk';
import { ElevenLabsSTTProvider } from './ElevenLabsSTTProvider';
import { ElevenLabsTTSProvider } from './ElevenLabsTTSProvider';

declare const stallion: { apiBase: string };

const apiBase = typeof stallion !== 'undefined' ? stallion.apiBase : '';

voiceRegistry.registerSTT(new ElevenLabsSTTProvider(apiBase));
voiceRegistry.registerTTS(new ElevenLabsTTSProvider(apiBase));
