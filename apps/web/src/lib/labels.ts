/**
 * Текстовые подписи статусов и причин: статус всегда сопровождается текстом
 * (docs/wireframes/README.md), коды не показываются пользователю без расшифровки.
 */
import type { CellStatus } from '@svyaz-est/contracts';

export const STATUS_LABELS: Record<CellStatus, string> = {
  green: 'Хорошая связь',
  yellow: 'Нестабильная связь',
  red: 'Плохая связь',
  insufficient_data: 'Недостаточно данных',
};

export const STATUS_COLORS: Record<CellStatus, string> = {
  green: '#2e9e5b',
  yellow: '#f2ac00',
  red: '#e5493a',
  insufficient_data: '#9aa0a6',
};

export const REASON_LABELS: Record<string, string> = {
  INSUFFICIENT_SAMPLES: 'Замеров меньше минимума (нужно не менее 5)',
  INSUFFICIENT_DATES: 'Замеры только за одну дату (нужны минимум 2 даты)',
  EXCLUDED_TRANSPORT: 'Часть записей сделана вне мобильной сети (Wi-Fi или неизвестный транспорт)',
  UNKNOWN_OPERATOR: 'Часть записей с неизвестным оператором исключена',
  VPN_DETECTED: 'Часть записей с обнаруженным VPN исключена',
  UNVERIFIED_METADATA: 'Часть записей с непроверенными метаданными исключена',
  OLD_RECORD: 'Часть записей старше окна 30 дней исключена',
  PROFILE_PASSED: 'Профиль задачи пройден в достаточной доле замеров',
  PROFILE_PARTIALLY_PASSED: 'Профиль задачи пройден примерно в половине замеров',
  PROFILE_FAILED: 'Профиль задачи в основном провален',
  GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED:
    'Среди замеров есть гостевые; независимость их авторов не подтверждается',
};

export function reasonText(code: string): string {
  return REASON_LABELS[code] ?? code;
}

export const NETWORK_LABELS: Record<string, string> = {
  '2g': '2G',
  '3g': '3G',
  '4g': '4G',
  '5g': '5G',
  unknown: 'Неизвестная сеть',
};

export const ENVIRONMENT_LABELS: Record<string, string> = {
  indoor: 'В помещении',
  outdoor: 'На улице',
  unknown: 'Условия неизвестны',
};
