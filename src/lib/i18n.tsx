import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Locale = "fr" | "en" | "ar";
export type Direction = "ltr" | "rtl";

export const LOCALES: { value: Locale; label: string; flag: string; dir: Direction }[] = [
  { value: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { value: "en", label: "English", flag: "🇬🇧", dir: "ltr" },
  { value: "ar", label: "العربية", flag: "🇸🇦", dir: "rtl" },
];

const STORAGE_KEY = "stemflow.locale";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en" || value === "ar";
}

export function directionOf(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

const fr = {
  "brand.tagline": "Scroll. Learn. Level Up.",

  "nav.feed": "Fil d'actualité",
  "nav.feed.short": "Fil",
  "nav.search": "Recherche",
  "nav.search.short": "Recherche",
  "nav.create": "Créer",
  "nav.create.short": "Créer",
  "nav.competitions": "Compétitions",
  "nav.competitions.short": "Défis",
  "nav.leaderboard": "Classement",
  "nav.leaderboard.short": "Classement",
  "nav.rooms": "Salons",
  "nav.rooms.short": "Salons",
  "nav.profile": "Profil",
  "nav.profile.short": "Profil",
  "nav.notifications": "Notifications",
  "nav.privacy": "Confidentialité",
  "nav.terms": "CGU",
  "nav.signOut": "Se déconnecter",

  "auth.signup": "Inscription",
  "auth.signin": "Connexion",
  "auth.username": "Nom d'utilisateur",
  "auth.username.placeholder": "amina_stem",
  "auth.email": "Email",
  "auth.email.placeholder": "toi@exemple.com",
  "auth.password": "Mot de passe",
  "auth.submit.signup": "Créer mon compte",
  "auth.submit.signin": "Se connecter",
  "auth.busy": "Patiente…",
  "auth.or": "OU",
  "auth.google": "Continuer avec Google",
  "auth.legal":
    "En continuant, tu acceptes nos conditions d'utilisation et notre politique de confidentialité.",
  "auth.created": "Compte créé ! Bienvenue sur STEMFLOW.",
  "auth.badCredentials": "Identifiants incorrects.",
  "auth.googleDisabled": "Le fournisseur Google n'est pas activé dans Supabase.",
  "auth.googleFailed": "Connexion Google impossible : {message}",

  "onboarding.step.language": "Langue",
  "onboarding.step.education": "Études",
  "onboarding.step.interests": "Intérêts",
  "onboarding.step.level": "Niveau",
  "onboarding.language.title": "Quelle langue préfères-tu ?",
  "onboarding.language.subtitle": "Tu pourras la changer plus tard.",
  "onboarding.education.title": "Où en es-tu dans tes études ?",
  "onboarding.education.subtitle": "Pour adapter la difficulté des contenus.",
  "onboarding.interests.title": "Qu'est-ce qui te passionne ?",
  "onboarding.interests.subtitle": "Choisis au moins un domaine.",
  "onboarding.level.title": "Ton niveau en sciences ?",
  "onboarding.level.subtitle": "On calibrera tes quiz et tes missions.",
  "onboarding.back": "Retour",
  "onboarding.continue": "Continuer",
  "onboarding.finish": "Découvrir mon fil",
  "onboarding.saveFailed": "Impossible d'enregistrer tes préférences.",
  "onboarding.ready": "Ton fil est prêt 🎉",
  "education.college": "Collège",
  "education.lycee": "Lycée",
  "education.universite": "Université",
  "education.autodidacte": "Autodidacte",
  "level.debutant": "Débutant",
  "level.debutant.description": "Je découvre les sciences",
  "level.intermediaire": "Intermédiaire",
  "level.intermediaire.description": "J'ai déjà des bases solides",
  "level.avance": "Avancé",
  "level.avance.description": "Je veux aller plus loin",

  "feed.forYou": "Pour toi",
  "feed.loading": "Chargement du fil…",
  "feed.empty": "Aucun contenu dans cette catégorie pour l'instant.",
  "feed.video": "Vidéo",
  "feed.startQuiz": "Commencer le quiz",
  "feed.readArticle": "Lire l'article",
  "feed.questions": "{count} questions",
  "feed.linkCopied": "Lien copié !",
  "feed.saved": "Ajouté à tes favoris",
  "feed.xpHint": "Ce contenu rapporte {count} XP",
  "feed.unmute": "Activer le son",
  "feed.mute": "Couper le son",

  "quiz.result": "Résultat",
  "quiz.progress": "Question {current} / {total}",
  "quiz.loading": "Chargement du quiz…",
  "quiz.emptyTitle": "Ce quiz n'a pas encore de questions.",
  "quiz.correct": "✅ Bonne réponse !",
  "quiz.incorrect": "❌ Pas tout à fait…",
  "quiz.validate": "Valider",
  "quiz.finish": "Terminer",
  "quiz.next": "Suivant",
  "quiz.score": "Score : {score}/{total} questions",
  "quiz.xpGained": "XP gagnés : +{count}",
  "quiz.alreadyDone": "Quiz déjà validé — pas d'XP supplémentaire cette fois.",
  "quiz.answer": "Bonne réponse : {answer}",
  "quiz.backToFeed": "Retour au fil",

  "comments.title": "Commentaires",
  "comments.loading": "Chargement…",
  "comments.empty": "Aucun commentaire. Lancez la discussion !",
  "comments.placeholder": "Ajouter un commentaire…",
  "comments.anonymous": "Anonyme",
  "comments.signInPrompt": "Connectez-vous pour commenter.",
  "comments.send": "Envoyer",

  "profile.missions": "Missions du jour",
  "profile.missions.empty": "Aucune mission aujourd'hui.",
  "profile.badges": "Badges",
  "profile.saved": "Contenus enregistrés",
  "profile.saved.empty": "Rien d'enregistré pour l'instant.",
  "profile.maxLevel": "Niveau max",
  "profile.toNextLevel": "{count} XP → {level}",
  "profile.days": "{count} jours",
  "profile.notFound": "Profil introuvable",
  "profile.notFound.description":
    "Ton compte existe, mais sa fiche de profil n'a pas pu être chargée.",
  "profile.retry": "Réessayer",
  "profile.language": "Langue de l'interface",

  "nav.courses": "Cours",
  "nav.courses.short": "Cours",

  "courses.title": "Cours certifiants",
  "courses.subtitle": "Suis une playlist STEM jusqu'au bout et obtiens ton certificat.",
  "courses.loading": "Chargement des cours…",
  "courses.empty": "Aucun cours pour l'instant. Importe une playlist pour commencer.",
  "courses.lessons": "{count} leçons",
  "courses.progress": "{percent} % terminé",
  "courses.start": "Commencer",
  "courses.continue": "Reprendre",
  "courses.done": "Terminé",
  "courses.notFound": "Cours introuvable",
  "courses.signInPrompt": "Connecte-toi pour suivre ce cours et obtenir un certificat.",
  "courses.watchToValidate": "Regarde {percent} % de la vidéo pour valider la leçon.",
  "courses.lessonDone": "Validée",
  "courses.myProgress": "Ta progression",
  "courses.import.title": "Importer une playlist YouTube",
  "courses.import.placeholder": "https://www.youtube.com/playlist?list=…",
  "courses.import.submit": "Importer",
  "courses.import.busy": "Import en cours…",
  "courses.import.done": "{count} vidéos importées",
  "courses.import.exists": "Cette playlist est déjà importée.",

  "certificate.earned": "Certificat obtenu 🎓",
  "certificate.view": "Voir mon certificat",
  "certificate.title": "Certificat de réussite",
  "certificate.awardedTo": "décerné à",
  "certificate.forCourse": "pour avoir suivi et terminé l'intégralité du cours",
  "certificate.issuedOn": "Délivré le {date}",
  "certificate.serial": "N° {serial}",
  "certificate.verify": "Vérifiable à l'adresse",
  "certificate.notFound": "Certificat introuvable",
  "certificate.print": "Imprimer",

  "common.loading": "Chargement…",
  "common.close": "Fermer",
} as const;

type Key = keyof typeof fr;
type Dictionary = Record<Key, string>;

const en: Dictionary = {
  "brand.tagline": "Scroll. Learn. Level Up.",

  "nav.feed": "Feed",
  "nav.feed.short": "Feed",
  "nav.search": "Search",
  "nav.search.short": "Search",
  "nav.create": "Create",
  "nav.create.short": "Create",
  "nav.competitions": "Competitions",
  "nav.competitions.short": "Battles",
  "nav.leaderboard": "Leaderboard",
  "nav.leaderboard.short": "Ranking",
  "nav.rooms": "Rooms",
  "nav.rooms.short": "Rooms",
  "nav.profile": "Profile",
  "nav.profile.short": "Profile",
  "nav.notifications": "Notifications",
  "nav.privacy": "Privacy",
  "nav.terms": "Terms",
  "nav.signOut": "Sign out",

  "auth.signup": "Sign up",
  "auth.signin": "Sign in",
  "auth.username": "Username",
  "auth.username.placeholder": "amina_stem",
  "auth.email": "Email",
  "auth.email.placeholder": "you@example.com",
  "auth.password": "Password",
  "auth.submit.signup": "Create my account",
  "auth.submit.signin": "Sign in",
  "auth.busy": "Hold on…",
  "auth.or": "OR",
  "auth.google": "Continue with Google",
  "auth.legal": "By continuing, you accept our terms of use and our privacy policy.",
  "auth.created": "Account created! Welcome to STEMFLOW.",
  "auth.badCredentials": "Incorrect credentials.",
  "auth.googleDisabled": "The Google provider is not enabled in Supabase.",
  "auth.googleFailed": "Google sign-in failed: {message}",

  "onboarding.step.language": "Language",
  "onboarding.step.education": "Studies",
  "onboarding.step.interests": "Interests",
  "onboarding.step.level": "Level",
  "onboarding.language.title": "Which language do you prefer?",
  "onboarding.language.subtitle": "You can change it later.",
  "onboarding.education.title": "Where are you in your studies?",
  "onboarding.education.subtitle": "So we can tune content difficulty.",
  "onboarding.interests.title": "What are you passionate about?",
  "onboarding.interests.subtitle": "Pick at least one field.",
  "onboarding.level.title": "Your level in science?",
  "onboarding.level.subtitle": "We'll calibrate your quizzes and missions.",
  "onboarding.back": "Back",
  "onboarding.continue": "Continue",
  "onboarding.finish": "Discover my feed",
  "onboarding.saveFailed": "Could not save your preferences.",
  "onboarding.ready": "Your feed is ready 🎉",
  "education.college": "Middle school",
  "education.lycee": "High school",
  "education.universite": "University",
  "education.autodidacte": "Self-taught",
  "level.debutant": "Beginner",
  "level.debutant.description": "I'm discovering science",
  "level.intermediaire": "Intermediate",
  "level.intermediaire.description": "I already have solid basics",
  "level.avance": "Advanced",
  "level.avance.description": "I want to go further",

  "feed.forYou": "For you",
  "feed.loading": "Loading your feed…",
  "feed.empty": "No content in this category yet.",
  "feed.video": "Video",
  "feed.startQuiz": "Start the quiz",
  "feed.readArticle": "Read the article",
  "feed.questions": "{count} questions",
  "feed.linkCopied": "Link copied!",
  "feed.saved": "Added to your bookmarks",
  "feed.xpHint": "This content is worth {count} XP",
  "feed.unmute": "Unmute",
  "feed.mute": "Mute",

  "quiz.result": "Result",
  "quiz.progress": "Question {current} / {total}",
  "quiz.loading": "Loading the quiz…",
  "quiz.emptyTitle": "This quiz has no questions yet.",
  "quiz.correct": "✅ Correct!",
  "quiz.incorrect": "❌ Not quite…",
  "quiz.validate": "Submit",
  "quiz.finish": "Finish",
  "quiz.next": "Next",
  "quiz.score": "Score: {score}/{total} questions",
  "quiz.xpGained": "XP earned: +{count}",
  "quiz.alreadyDone": "Quiz already completed — no extra XP this time.",
  "quiz.answer": "Correct answer: {answer}",
  "quiz.backToFeed": "Back to the feed",

  "comments.title": "Comments",
  "comments.loading": "Loading…",
  "comments.empty": "No comments yet. Start the conversation!",
  "comments.placeholder": "Add a comment…",
  "comments.anonymous": "Anonymous",
  "comments.signInPrompt": "Sign in to comment.",
  "comments.send": "Send",

  "profile.missions": "Today's missions",
  "profile.missions.empty": "No mission today.",
  "profile.badges": "Badges",
  "profile.saved": "Saved content",
  "profile.saved.empty": "Nothing saved yet.",
  "profile.maxLevel": "Max level",
  "profile.toNextLevel": "{count} XP → {level}",
  "profile.days": "{count} days",
  "profile.notFound": "Profile not found",
  "profile.notFound.description":
    "Your account exists, but its profile record could not be loaded.",
  "profile.retry": "Try again",
  "profile.language": "Interface language",

  "nav.courses": "Courses",
  "nav.courses.short": "Courses",

  "courses.title": "Certified courses",
  "courses.subtitle": "Follow a STEM playlist to the end and earn your certificate.",
  "courses.loading": "Loading courses…",
  "courses.empty": "No course yet. Import a playlist to get started.",
  "courses.lessons": "{count} lessons",
  "courses.progress": "{percent}% complete",
  "courses.start": "Start",
  "courses.continue": "Resume",
  "courses.done": "Completed",
  "courses.notFound": "Course not found",
  "courses.signInPrompt": "Sign in to follow this course and earn a certificate.",
  "courses.watchToValidate": "Watch {percent}% of the video to validate the lesson.",
  "courses.lessonDone": "Done",
  "courses.myProgress": "Your progress",
  "courses.import.title": "Import a YouTube playlist",
  "courses.import.placeholder": "https://www.youtube.com/playlist?list=…",
  "courses.import.submit": "Import",
  "courses.import.busy": "Importing…",
  "courses.import.done": "{count} videos imported",
  "courses.import.exists": "This playlist is already imported.",

  "certificate.earned": "Certificate earned 🎓",
  "certificate.view": "View my certificate",
  "certificate.title": "Certificate of completion",
  "certificate.awardedTo": "awarded to",
  "certificate.forCourse": "for completing the entire course",
  "certificate.issuedOn": "Issued on {date}",
  "certificate.serial": "No. {serial}",
  "certificate.verify": "Verifiable at",
  "certificate.notFound": "Certificate not found",
  "certificate.print": "Print",

  "common.loading": "Loading…",
  "common.close": "Close",
};

const ar: Dictionary = {
  "brand.tagline": "تصفّح. تعلّم. تقدّم.",

  "nav.feed": "التدفّق",
  "nav.feed.short": "التدفّق",
  "nav.search": "البحث",
  "nav.search.short": "البحث",
  "nav.create": "إنشاء",
  "nav.create.short": "إنشاء",
  "nav.competitions": "المسابقات",
  "nav.competitions.short": "التحدّيات",
  "nav.leaderboard": "الترتيب",
  "nav.leaderboard.short": "الترتيب",
  "nav.rooms": "الغرف",
  "nav.rooms.short": "الغرف",
  "nav.profile": "الملف الشخصي",
  "nav.profile.short": "الملف",
  "nav.notifications": "الإشعارات",
  "nav.privacy": "الخصوصية",
  "nav.terms": "الشروط",
  "nav.signOut": "تسجيل الخروج",

  "auth.signup": "إنشاء حساب",
  "auth.signin": "تسجيل الدخول",
  "auth.username": "اسم المستخدم",
  "auth.username.placeholder": "amina_stem",
  "auth.email": "البريد الإلكتروني",
  "auth.email.placeholder": "you@example.com",
  "auth.password": "كلمة المرور",
  "auth.submit.signup": "أنشئ حسابي",
  "auth.submit.signin": "تسجيل الدخول",
  "auth.busy": "لحظة من فضلك…",
  "auth.or": "أو",
  "auth.google": "المتابعة باستخدام Google",
  "auth.legal": "بمتابعتك، فإنك توافق على شروط الاستخدام وسياسة الخصوصية.",
  "auth.created": "تم إنشاء الحساب! مرحبًا بك في STEMFLOW.",
  "auth.badCredentials": "بيانات الدخول غير صحيحة.",
  "auth.googleDisabled": "موفّر Google غير مفعّل في Supabase.",
  "auth.googleFailed": "تعذّر تسجيل الدخول عبر Google: {message}",

  "onboarding.step.language": "اللغة",
  "onboarding.step.education": "الدراسة",
  "onboarding.step.interests": "الاهتمامات",
  "onboarding.step.level": "المستوى",
  "onboarding.language.title": "ما اللغة التي تفضّلها؟",
  "onboarding.language.subtitle": "يمكنك تغييرها لاحقًا.",
  "onboarding.education.title": "أين أنت في مسارك الدراسي؟",
  "onboarding.education.subtitle": "لنضبط مستوى صعوبة المحتوى.",
  "onboarding.interests.title": "ما الذي يثير شغفك؟",
  "onboarding.interests.subtitle": "اختر مجالًا واحدًا على الأقل.",
  "onboarding.level.title": "ما مستواك في العلوم؟",
  "onboarding.level.subtitle": "سنضبط الاختبارات والمهامّ على أساسه.",
  "onboarding.back": "رجوع",
  "onboarding.continue": "متابعة",
  "onboarding.finish": "اكتشف تدفّقي",
  "onboarding.saveFailed": "تعذّر حفظ تفضيلاتك.",
  "onboarding.ready": "تدفّقك جاهز 🎉",
  "education.college": "الإعدادية",
  "education.lycee": "الثانوية",
  "education.universite": "الجامعة",
  "education.autodidacte": "تعلّم ذاتي",
  "level.debutant": "مبتدئ",
  "level.debutant.description": "أكتشف العلوم",
  "level.intermediaire": "متوسّط",
  "level.intermediaire.description": "لديّ أسس متينة",
  "level.avance": "متقدّم",
  "level.avance.description": "أريد التعمّق أكثر",

  "feed.forYou": "مخصّص لك",
  "feed.loading": "جارٍ تحميل التدفّق…",
  "feed.empty": "لا يوجد محتوى في هذه الفئة بعد.",
  "feed.video": "فيديو",
  "feed.startQuiz": "ابدأ الاختبار",
  "feed.readArticle": "اقرأ المقال",
  "feed.questions": "{count} أسئلة",
  "feed.linkCopied": "تم نسخ الرابط!",
  "feed.saved": "أُضيف إلى مفضّلاتك",
  "feed.xpHint": "يمنحك هذا المحتوى {count} نقطة خبرة",
  "feed.unmute": "تشغيل الصوت",
  "feed.mute": "كتم الصوت",

  "quiz.result": "النتيجة",
  "quiz.progress": "السؤال {current} / {total}",
  "quiz.loading": "جارٍ تحميل الاختبار…",
  "quiz.emptyTitle": "لا يحتوي هذا الاختبار على أسئلة بعد.",
  "quiz.correct": "✅ إجابة صحيحة!",
  "quiz.incorrect": "❌ ليست دقيقة تمامًا…",
  "quiz.validate": "تأكيد",
  "quiz.finish": "إنهاء",
  "quiz.next": "التالي",
  "quiz.score": "النتيجة: {score}/{total} أسئلة",
  "quiz.xpGained": "نقاط الخبرة: +{count}",
  "quiz.alreadyDone": "سبق أن أنجزت هذا الاختبار — لا نقاط إضافية هذه المرة.",
  "quiz.answer": "الإجابة الصحيحة: {answer}",
  "quiz.backToFeed": "العودة إلى التدفّق",

  "comments.title": "التعليقات",
  "comments.loading": "جارٍ التحميل…",
  "comments.empty": "لا توجد تعليقات. ابدأ النقاش!",
  "comments.placeholder": "أضف تعليقًا…",
  "comments.anonymous": "مجهول",
  "comments.signInPrompt": "سجّل الدخول للتعليق.",
  "comments.send": "إرسال",

  "profile.missions": "مهامّ اليوم",
  "profile.missions.empty": "لا توجد مهامّ اليوم.",
  "profile.badges": "الأوسمة",
  "profile.saved": "المحتوى المحفوظ",
  "profile.saved.empty": "لا شيء محفوظ بعد.",
  "profile.maxLevel": "أعلى مستوى",
  "profile.toNextLevel": "{count} نقطة خبرة ← {level}",
  "profile.days": "{count} يومًا",
  "profile.notFound": "الملف الشخصي غير موجود",
  "profile.notFound.description": "حسابك موجود، لكن تعذّر تحميل بطاقة ملفك الشخصي.",
  "profile.retry": "أعد المحاولة",
  "profile.language": "لغة الواجهة",

  "nav.courses": "الدورات",
  "nav.courses.short": "الدورات",

  "courses.title": "دورات بشهادات",
  "courses.subtitle": "أكمل قائمة تشغيل علمية حتى نهايتها واحصل على شهادتك.",
  "courses.loading": "جارٍ تحميل الدورات…",
  "courses.empty": "لا توجد دورات بعد. استورد قائمة تشغيل للبدء.",
  "courses.lessons": "{count} دروس",
  "courses.progress": "اكتمل {percent}٪",
  "courses.start": "ابدأ",
  "courses.continue": "متابعة",
  "courses.done": "مكتملة",
  "courses.notFound": "الدورة غير موجودة",
  "courses.signInPrompt": "سجّل الدخول لمتابعة هذه الدورة والحصول على شهادة.",
  "courses.watchToValidate": "شاهد {percent}٪ من الفيديو لاعتماد الدرس.",
  "courses.lessonDone": "معتمد",
  "courses.myProgress": "تقدّمك",
  "courses.import.title": "استيراد قائمة تشغيل من يوتيوب",
  "courses.import.placeholder": "https://www.youtube.com/playlist?list=…",
  "courses.import.submit": "استيراد",
  "courses.import.busy": "جارٍ الاستيراد…",
  "courses.import.done": "تم استيراد {count} فيديو",
  "courses.import.exists": "قائمة التشغيل هذه مستوردة بالفعل.",

  "certificate.earned": "تم الحصول على الشهادة 🎓",
  "certificate.view": "عرض شهادتي",
  "certificate.title": "شهادة إتمام",
  "certificate.awardedTo": "تُمنح إلى",
  "certificate.forCourse": "لإتمامه الدورة كاملةً",
  "certificate.issuedOn": "صدرت في {date}",
  "certificate.serial": "رقم {serial}",
  "certificate.verify": "قابلة للتحقق على",
  "certificate.notFound": "الشهادة غير موجودة",
  "certificate.print": "طباعة",

  "common.loading": "جارٍ التحميل…",
  "common.close": "إغلاق",
};

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en, ar };

export type Translate = (key: Key, vars?: Record<string, string | number>) => string;

type I18nContextValue = {
  locale: Locale;
  dir: Direction;
  setLocale: (next: Locale) => void;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  const navigatorLocale = window.navigator.language.slice(0, 2);
  return isLocale(navigatorLocale) ? navigatorLocale : "fr";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  // Le profil fait autorité au premier chargement d'une session : la préférence
  // enregistrée pendant l'onboarding suit l'utilisateur d'un appareil à l'autre.
  useEffect(() => {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    if (stored) return;
    if (isLocale(profile?.preferred_language)) setLocaleState(profile.preferred_language);
  }, [profile?.preferred_language]);

  // `dir` et `lang` sont posés côté client : le shell SSR ne connaît pas encore
  // la langue choisie.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = directionOf(locale);
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
      if (session) {
        void supabase
          .from("profiles")
          .update({ preferred_language: next })
          .eq("id", session.user.id)
          .then(({ error }) => {
            if (error) console.error("[i18n] langue non enregistrée", error);
          });
      }
    },
    [session],
  );

  const t = useCallback<Translate>(
    (key, vars) => {
      // Repli sur le français : une clé absente d'une traduction reste lisible
      // plutôt que d'afficher son identifiant brut.
      const template = DICTIONARIES[locale][key] ?? fr[key] ?? key;
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, dir: directionOf(locale), setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n doit être utilisé dans I18nProvider");
  return ctx;
}
