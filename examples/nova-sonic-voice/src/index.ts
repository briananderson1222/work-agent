/**
 * Nova Sonic Voice plugin — client bundle entry point.
 */
import { voiceRegistry } from '@stallion-ai/sdk';
import { NovaSonicProvider } from './NovaSonicProvider';

declare const stallion: { apiBase: string };

const apiBase = typeof stallion !== 'undefined' ? stallion.apiBase : '';

voiceRegistry.registerSTT(new NovaSonicProvider(apiBase));
// NovaSonicProvider also implements TTSProvider (same session)
voiceRegistry.registerTTS(new NovaSonicProvider(apiBase));
