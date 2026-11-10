import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

let listenerInstalled = false;
let activeUserId: string | null = null;

/** Consentimento explícito do motoboy; não ativa FCM automaticamente em toda inicialização. */
export async function enableCosmosPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('Notificações push disponíveis no aplicativo Android.');
  }
  const permissions = await PushNotifications.checkPermissions();
  const current =
    permissions.receive === 'granted' ? permissions : await PushNotifications.requestPermissions();
  if (current.receive !== 'granted') {
    throw new Error('Permissão negada. Autorize as notificações nas configurações do Android.');
  }
  activeUserId = userId;
  if (!listenerInstalled) {
    await PushNotifications.addListener('registration', (token: Token) => {
      if (!activeUserId || !token.value) return;
      void setDoc(doc(db, 'motoboy_device_tokens', activeUserId), {
        user_id: activeUserId,
        token: token.value,
        platform: 'android',
        updated_at: serverTimestamp(),
      }).catch((error: unknown) => console.error('Falha ao salvar token FCM COSMOS:', error));
    });
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('FCM registration:', error);
    });
    listenerInstalled = true;
  }
  await PushNotifications.createChannel({
    id: 'cosmos_updates',
    name: 'JapanFlow COSMOS',
    description: 'Corridas, mensagens e atualizações da equipe',
    importance: 4,
    visibility: 1,
  });
  await PushNotifications.register();
}

/** Evita entregar notificações da conta anterior após logout. */
export async function disableCosmosPush(userId: string): Promise<void> {
  activeUserId = null;
  await deleteDoc(doc(db, 'motoboy_device_tokens', userId));
}
