import { useEffect } from 'react';
import { confirmOtaStartup } from '../otaEngine';

export default function OtaStartupReady() {
  useEffect(() => {
    void confirmOtaStartup().catch((error) => {
      console.error('[JapanFlow OTA] Startup confirmation failed', error);
    });
  }, []);

  return null;
}
