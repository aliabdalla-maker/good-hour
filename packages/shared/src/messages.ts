import { DEFAULT_LOCALE, getLocale } from "./locales";

/**
 * UI strings — the navigation and the handful of phrases that decide whether a
 * stranger can find their way around.
 *
 * ## Why this is small
 *
 * Deliberately. The app has thousands of strings across thirty-odd screens, and
 * machine-generating all of them into forty languages would produce a great deal of
 * text nobody involved can read — including me. Getting "You pay" or "binding offer"
 * subtly wrong in a language I cannot check is worse than showing English, because a
 * user who sees English knows they are reading a foreign language, whereas a user who
 * sees confident nonsense does not.
 *
 * So: the navigation and orientation strings are translated, everything else falls
 * back to English **per key**, and the locale carries a `translation` status the UI
 * discloses. Growing the catalogue is a translation problem, not an engineering one —
 * the machinery below does not change.
 *
 * ## What is NOT here, on purpose
 *
 * Money, fees, terms, and anything binding. Those live in English until a speaker of
 * the language has reviewed them. A mistranslated auction clause is a legal problem,
 * not a UX blemish.
 */

export const MESSAGE_KEYS = [
  "nav.browse",
  "nav.searchByTime",
  "nav.market",
  "nav.auctions",
  "nav.wallet",
  "nav.notifications",
  "nav.login",
  "nav.register",
  "nav.logout",
  "common.loading",
  "common.search",
  "common.cancel",
  "common.retry",
  "common.perHour",
  "locale.picker",
  "locale.unreviewed",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

type Catalogue = Partial<Record<MessageKey, string>>;

/** The source of truth. Every other locale is measured against this. */
const en: Record<MessageKey, string> = {
  "nav.browse": "Browse",
  "nav.searchByTime": "Search by time",
  "nav.market": "Products & services",
  "nav.auctions": "Auctions & requests",
  "nav.wallet": "Wallet",
  "nav.notifications": "Notifications",
  "nav.login": "Log in",
  "nav.register": "Register",
  "nav.logout": "Log out",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.cancel": "Cancel",
  "common.retry": "Try again",
  "common.perHour": "per hour",
  "locale.picker": "Language",
  "locale.unreviewed": "This translation hasn't been reviewed by a speaker yet.",
};

/**
 * Translations, all marked `unreviewed` in locales.ts.
 *
 * Restricted to languages where these particular short, concrete UI nouns are
 * unambiguous. Nothing here is a claim of fluency — it is a claim that "Wallet" and
 * "Browse" are safe to render, and the disclosure string tells the user the rest.
 */
const CATALOGUES: Record<string, Catalogue> = {
  en,

  "zh-Hans": {
    "nav.browse": "浏览",
    "nav.searchByTime": "按时间搜索",
    "nav.market": "商品与服务",
    "nav.auctions": "竞拍与需求",
    "nav.wallet": "钱包",
    "nav.notifications": "通知",
    "nav.login": "登录",
    "nav.register": "注册",
    "nav.logout": "退出登录",
    "common.loading": "加载中…",
    "common.search": "搜索",
    "common.cancel": "取消",
    "common.retry": "重试",
    "common.perHour": "每小时",
    "locale.picker": "语言",
    "locale.unreviewed": "此翻译尚未经母语者校对。",
  },

  hi: {
    "nav.browse": "ब्राउज़ करें",
    "nav.searchByTime": "समय से खोजें",
    "nav.market": "उत्पाद और सेवाएँ",
    "nav.auctions": "नीलामी और अनुरोध",
    "nav.wallet": "वॉलेट",
    "nav.notifications": "सूचनाएँ",
    "nav.login": "लॉग इन",
    "nav.register": "रजिस्टर करें",
    "nav.logout": "लॉग आउट",
    "common.loading": "लोड हो रहा है…",
    "common.search": "खोजें",
    "common.cancel": "रद्द करें",
    "common.retry": "पुनः प्रयास करें",
    "common.perHour": "प्रति घंटा",
    "locale.picker": "भाषा",
    "locale.unreviewed": "इस अनुवाद की समीक्षा किसी वक्ता द्वारा नहीं की गई है।",
  },

  es: {
    "nav.browse": "Explorar",
    "nav.searchByTime": "Buscar por hora",
    "nav.market": "Productos y servicios",
    "nav.auctions": "Subastas y solicitudes",
    "nav.wallet": "Cartera",
    "nav.notifications": "Notificaciones",
    "nav.login": "Iniciar sesión",
    "nav.register": "Registrarse",
    "nav.logout": "Cerrar sesión",
    "common.loading": "Cargando…",
    "common.search": "Buscar",
    "common.cancel": "Cancelar",
    "common.retry": "Intentar de nuevo",
    "common.perHour": "por hora",
    "locale.picker": "Idioma",
    "locale.unreviewed": "Esta traducción aún no ha sido revisada por un hablante.",
  },

  ar: {
    "nav.browse": "تصفّح",
    "nav.searchByTime": "البحث حسب الوقت",
    "nav.market": "المنتجات والخدمات",
    "nav.auctions": "المزادات والطلبات",
    "nav.wallet": "المحفظة",
    "nav.notifications": "الإشعارات",
    "nav.login": "تسجيل الدخول",
    "nav.register": "إنشاء حساب",
    "nav.logout": "تسجيل الخروج",
    "common.loading": "جارٍ التحميل…",
    "common.search": "بحث",
    "common.cancel": "إلغاء",
    "common.retry": "إعادة المحاولة",
    "common.perHour": "لكل ساعة",
    "locale.picker": "اللغة",
    "locale.unreviewed": "لم تُراجع هذه الترجمة من قِبل متحدث بعد.",
  },

  fr: {
    "nav.browse": "Parcourir",
    "nav.searchByTime": "Rechercher par heure",
    "nav.market": "Produits et services",
    "nav.auctions": "Enchères et demandes",
    "nav.wallet": "Portefeuille",
    "nav.notifications": "Notifications",
    "nav.login": "Se connecter",
    "nav.register": "S'inscrire",
    "nav.logout": "Se déconnecter",
    "common.loading": "Chargement…",
    "common.search": "Rechercher",
    "common.cancel": "Annuler",
    "common.retry": "Réessayer",
    "common.perHour": "par heure",
    "locale.picker": "Langue",
    "locale.unreviewed": "Cette traduction n'a pas encore été relue par un locuteur.",
  },

  pt: {
    "nav.browse": "Explorar",
    "nav.searchByTime": "Buscar por hora",
    "nav.market": "Produtos e serviços",
    "nav.auctions": "Leilões e pedidos",
    "nav.wallet": "Carteira",
    "nav.notifications": "Notificações",
    "nav.login": "Entrar",
    "nav.register": "Registar",
    "nav.logout": "Sair",
    "common.loading": "A carregar…",
    "common.search": "Buscar",
    "common.cancel": "Cancelar",
    "common.retry": "Tentar novamente",
    "common.perHour": "por hora",
    "locale.picker": "Idioma",
    "locale.unreviewed": "Esta tradução ainda não foi revista por um falante.",
  },

  ru: {
    "nav.browse": "Обзор",
    "nav.searchByTime": "Поиск по времени",
    "nav.market": "Товары и услуги",
    "nav.auctions": "Аукционы и заявки",
    "nav.wallet": "Кошелёк",
    "nav.notifications": "Уведомления",
    "nav.login": "Войти",
    "nav.register": "Регистрация",
    "nav.logout": "Выйти",
    "common.loading": "Загрузка…",
    "common.search": "Поиск",
    "common.cancel": "Отмена",
    "common.retry": "Повторить",
    "common.perHour": "в час",
    "locale.picker": "Язык",
    "locale.unreviewed": "Этот перевод ещё не проверен носителем языка.",
  },

  de: {
    "nav.browse": "Entdecken",
    "nav.searchByTime": "Nach Zeit suchen",
    "nav.market": "Produkte & Dienstleistungen",
    "nav.auctions": "Auktionen & Anfragen",
    "nav.wallet": "Guthaben",
    "nav.notifications": "Benachrichtigungen",
    "nav.login": "Anmelden",
    "nav.register": "Registrieren",
    "nav.logout": "Abmelden",
    "common.loading": "Wird geladen…",
    "common.search": "Suchen",
    "common.cancel": "Abbrechen",
    "common.retry": "Erneut versuchen",
    "common.perHour": "pro Stunde",
    "locale.picker": "Sprache",
    "locale.unreviewed": "Diese Übersetzung wurde noch nicht von einem Sprecher geprüft.",
  },

  ja: {
    "nav.browse": "さがす",
    "nav.searchByTime": "時間で検索",
    "nav.market": "商品とサービス",
    "nav.auctions": "オークションと募集",
    "nav.wallet": "ウォレット",
    "nav.notifications": "お知らせ",
    "nav.login": "ログイン",
    "nav.register": "登録",
    "nav.logout": "ログアウト",
    "common.loading": "読み込み中…",
    "common.search": "検索",
    "common.cancel": "キャンセル",
    "common.retry": "再試行",
    "common.perHour": "1時間あたり",
    "locale.picker": "言語",
    "locale.unreviewed": "この翻訳はまだ話者による確認を受けていません。",
  },

  tr: {
    "nav.browse": "Keşfet",
    "nav.searchByTime": "Saate göre ara",
    "nav.market": "Ürünler ve hizmetler",
    "nav.auctions": "Açık artırmalar ve talepler",
    "nav.wallet": "Cüzdan",
    "nav.notifications": "Bildirimler",
    "nav.login": "Giriş yap",
    "nav.register": "Kaydol",
    "nav.logout": "Çıkış yap",
    "common.loading": "Yükleniyor…",
    "common.search": "Ara",
    "common.cancel": "İptal",
    "common.retry": "Tekrar dene",
    "common.perHour": "saat başına",
    "locale.picker": "Dil",
    "locale.unreviewed": "Bu çeviri henüz bir konuşmacı tarafından incelenmedi.",
  },

  ko: {
    "nav.browse": "둘러보기",
    "nav.searchByTime": "시간으로 검색",
    "nav.market": "상품 및 서비스",
    "nav.auctions": "경매 및 요청",
    "nav.wallet": "지갑",
    "nav.notifications": "알림",
    "nav.login": "로그인",
    "nav.register": "회원가입",
    "nav.logout": "로그아웃",
    "common.loading": "불러오는 중…",
    "common.search": "검색",
    "common.cancel": "취소",
    "common.retry": "다시 시도",
    "common.perHour": "시간당",
    "locale.picker": "언어",
    "locale.unreviewed": "이 번역은 아직 원어민의 검토를 받지 않았습니다.",
  },

  it: {
    "nav.browse": "Esplora",
    "nav.searchByTime": "Cerca per ora",
    "nav.market": "Prodotti e servizi",
    "nav.auctions": "Aste e richieste",
    "nav.wallet": "Portafoglio",
    "nav.notifications": "Notifiche",
    "nav.login": "Accedi",
    "nav.register": "Registrati",
    "nav.logout": "Esci",
    "common.loading": "Caricamento…",
    "common.search": "Cerca",
    "common.cancel": "Annulla",
    "common.retry": "Riprova",
    "common.perHour": "all'ora",
    "locale.picker": "Lingua",
    "locale.unreviewed": "Questa traduzione non è ancora stata verificata da un parlante.",
  },

  pl: {
    "nav.browse": "Przeglądaj",
    "nav.searchByTime": "Szukaj po godzinie",
    "nav.market": "Produkty i usługi",
    "nav.auctions": "Aukcje i zapytania",
    "nav.wallet": "Portfel",
    "nav.notifications": "Powiadomienia",
    "nav.login": "Zaloguj się",
    "nav.register": "Zarejestruj się",
    "nav.logout": "Wyloguj się",
    "common.loading": "Ładowanie…",
    "common.search": "Szukaj",
    "common.cancel": "Anuluj",
    "common.retry": "Spróbuj ponownie",
    "common.perHour": "za godzinę",
    "locale.picker": "Język",
    "locale.unreviewed": "To tłumaczenie nie zostało jeszcze sprawdzone przez native speakera.",
  },

  uk: {
    "nav.browse": "Огляд",
    "nav.searchByTime": "Пошук за часом",
    "nav.market": "Товари та послуги",
    "nav.auctions": "Аукціони та запити",
    "nav.wallet": "Гаманець",
    "nav.notifications": "Повідомлення",
    "nav.login": "Увійти",
    "nav.register": "Зареєструватися",
    "nav.logout": "Вийти",
    "common.loading": "Завантаження…",
    "common.search": "Пошук",
    "common.cancel": "Скасувати",
    "common.retry": "Спробувати ще раз",
    "common.perHour": "за годину",
    "locale.picker": "Мова",
    "locale.unreviewed": "Цей переклад ще не перевірений носієм мови.",
  },

  nl: {
    "nav.browse": "Verkennen",
    "nav.searchByTime": "Zoeken op tijd",
    "nav.market": "Producten en diensten",
    "nav.auctions": "Veilingen en aanvragen",
    "nav.wallet": "Portemonnee",
    "nav.notifications": "Meldingen",
    "nav.login": "Inloggen",
    "nav.register": "Registreren",
    "nav.logout": "Uitloggen",
    "common.loading": "Laden…",
    "common.search": "Zoeken",
    "common.cancel": "Annuleren",
    "common.retry": "Opnieuw proberen",
    "common.perHour": "per uur",
    "locale.picker": "Taal",
    "locale.unreviewed": "Deze vertaling is nog niet nagekeken door een spreker.",
  },
};

/**
 * Looks up a string, falling back to English **per key** rather than per locale.
 *
 * Per-key matters: a partially translated locale should show the strings it has and
 * English for the rest, not drop back to English wholesale because one key is
 * missing. That is what lets the catalogue grow one string at a time.
 */
export function t(locale: string, key: MessageKey): string {
  const code = getLocale(locale).code;
  return CATALOGUES[code]?.[key] ?? CATALOGUES[DEFAULT_LOCALE]![key] ?? en[key];
}

/** How much of the catalogue a locale actually covers, 0..1. Used for disclosure. */
export function translationCoverage(locale: string): number {
  const code = getLocale(locale).code;
  const cat = CATALOGUES[code];
  if (!cat) return 0;
  const present = MESSAGE_KEYS.filter((k) => typeof cat[k] === "string").length;
  return present / MESSAGE_KEYS.length;
}

export function hasCatalogue(locale: string): boolean {
  return Boolean(CATALOGUES[getLocale(locale).code]);
}
