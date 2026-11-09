import type { User } from '@/types';

// O Android é exclusivo para motoboys. Administradores usam o ERP web.
// Regra de interface: a autorização dos dados continua obrigatória no Firestore.
export function isMotoboyUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin') return false;
  const functionName = String(user.function || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  const sectors = Array.isArray(user.sectors)
    ? user.sectors.map((s) => String(s).toLowerCase())
    : [];
  return role === 'motoboy' || functionName.includes('motoboy') || sectors.includes('motoboys');
}
