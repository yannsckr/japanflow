import { useEffect } from 'react';
import { confirmOtaPilotStartup } from './otaPilotStartup';

export default function OtaStartupReady() {
  useEffect(() => {
    void confirmOtaPilotStartup();
  }, []);
  return null;
}
