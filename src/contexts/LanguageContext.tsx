import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Lang = "en" | "ar";

interface LanguageContextValue {
  lang:      Lang;
  isRTL:     boolean;
  toggleLang: () => void;
  t: (key: string) => string;
}

// ─── Translations ─────────────────────────────────────────────────────────────

const translations: Record<string, Record<Lang, string>> = {
  // ── Login page ──────────────────────────────────────────────────────────────
  "auth.welcome":           { en: "Welcome back",         ar: "مرحباً بعودتك" },
  "auth.welcomeSub":        { en: "Sign in to your account to continue", ar: "سجّل دخولك للمتابعة" },
  "auth.email":             { en: "Email address",        ar: "البريد الإلكتروني" },
  "auth.emailPlaceholder":  { en: "you@example.com",      ar: "example@example.com" },
  "auth.password":          { en: "Password",             ar: "كلمة المرور" },
  "auth.forgot":            { en: "Forgot password?",     ar: "نسيت كلمة المرور؟" },
  "auth.patient":           { en: "Patient",              ar: "مريض" },
  "auth.physio":            { en: "Physiotherapist",      ar: "معالج فيزيائي" },
  "auth.signInAs":          { en: "Sign in as",           ar: "تسجيل الدخول كـ" },
  "auth.signingIn":         { en: "Signing in…",          ar: "جاري الدخول…" },
  "auth.noAccount":         { en: "Don't have an account?", ar: "ليس لديك حساب؟" },
  "auth.createOne":         { en: "Create one",           ar: "إنشاء حساب" },
  "auth.terms":             { en: "By signing in you agree to our Terms of Service and Privacy Policy", ar: "بتسجيل الدخول فإنك توافق على شروط الخدمة وسياسة الخصوصية" },
  "auth.resetTitle":        { en: "Reset your password",  ar: "إعادة تعيين كلمة المرور" },
  "auth.resetSub":          { en: "We'll send a reset link to your email address.", ar: "سنرسل رابط إعادة التعيين إلى بريدك الإلكتروني." },
  "auth.resetSend":         { en: "Send reset link",      ar: "إرسال رابط الإعادة" },
  "auth.resetCancel":       { en: "Cancel",               ar: "إلغاء" },
  "auth.resetSentPrefix":   { en: "Reset link sent to",   ar: "تم إرسال رابط الإعادة إلى" },
  "auth.resetSentSuffix":   { en: "Check your inbox.",    ar: "تحقق من صندوق الوارد." },
  "auth.backToSignIn":      { en: "Back to sign in",      ar: "العودة لتسجيل الدخول" },
  "auth.logout":            { en: "Sign out",             ar: "تسجيل الخروج" },

  // ── Register page ───────────────────────────────────────────────────────────
  "reg.alreadyHaveAccount": { en: "Already registered?",  ar: "لديك حساب بالفعل؟" },
  "reg.signIn":             { en: "Sign in",              ar: "تسجيل الدخول" },
  "reg.stepAccount":        { en: "Account",              ar: "الحساب" },
  "reg.stepProfile":        { en: "Profile",              ar: "الملف" },
  "reg.step1Title":         { en: "Create your account",  ar: "إنشاء حسابك" },
  "reg.step1Sub":           { en: "Set up your Physio+ Hub login credentials", ar: "أنشئ بيانات دخولك إلى Physio+ Hub" },
  "reg.step2Title":         { en: "Complete your profile", ar: "أكمل ملفك الشخصي" },
  "reg.step2Sub":           { en: "We need a few more details to set up your account", ar: "نحتاج بعض التفاصيل الإضافية لإتمام حسابك" },
  "reg.patientAccount":     { en: "Patient Account",      ar: "حساب مريض" },
  "reg.physioAccount":      { en: "Physiotherapist Account", ar: "حساب معالج فيزيائي" },
  "reg.firstName":          { en: "First name",           ar: "الاسم الأول" },
  "reg.lastName":           { en: "Last name",            ar: "اسم العائلة" },
  "reg.email":              { en: "Email address",        ar: "البريد الإلكتروني" },
  "reg.password":           { en: "Password",             ar: "كلمة المرور" },
  "reg.passwordHint":       { en: "Minimum 6 characters", ar: "٦ أحرف على الأقل" },
  "reg.confirmPw":          { en: "Confirm password",     ar: "تأكيد كلمة المرور" },
  "reg.pwMatch":            { en: "Passwords match",      ar: "كلمتا المرور متطابقتان" },
  "reg.pwNoMatch":          { en: "Passwords do not match", ar: "كلمتا المرور غير متطابقتين" },
  "reg.dob":                { en: "Date of birth",        ar: "تاريخ الميلاد" },
  "reg.phone":              { en: "Phone number",         ar: "رقم الهاتف" },
  "reg.continue":           { en: "Continue",             ar: "متابعة" },
  "reg.back":               { en: "Back",                 ar: "رجوع" },
  "reg.creating":           { en: "Creating account…",    ar: "جاري إنشاء الحساب…" },
  "reg.createAccount":      { en: "Create Account",       ar: "إنشاء الحساب" },
  "reg.license":            { en: "HCPC / License number", ar: "رقم الترخيص / HCPC" },
  "reg.clinicName":         { en: "Clinic name",          ar: "اسم العيادة" },
  "reg.phone.physio":       { en: "Contact phone",        ar: "رقم التواصل" },

  // ── Patient nav ─────────────────────────────────────────────────────────────
  "nav.home":               { en: "Home",                 ar: "الرئيسية" },
  "nav.home.desc":          { en: "Overview",             ar: "ملخص" },
  "nav.exercises":          { en: "Exercises",            ar: "التمارين" },
  "nav.exercises.desc":     { en: "Your program",         ar: "برنامجك" },
  "nav.appointments":       { en: "Appointments",         ar: "المواعيد" },
  "nav.appointments.desc":  { en: "Upcoming",             ar: "القادمة" },
  "nav.patientSheet":       { en: "Patient Sheet",        ar: "ملف المريض" },
  "nav.patientSheet.desc":  { en: "View records",         ar: "سجلاتك" },
  "nav.feedback":           { en: "Feedback",             ar: "التقييم" },
  "nav.feedback.desc":      { en: "Rate session",         ar: "قيّم جلستك" },
  "nav.myPortal":           { en: "My Portal",            ar: "بوابتي" },
  "nav.back":               { en: "Back",                 ar: "رجوع" },

  // ── Physio nav ──────────────────────────────────────────────────────────────
  "nav.overview":           { en: "Overview",             ar: "نظرة عامة" },
  "nav.patients":           { en: "Patients",             ar: "المرضى" },
  "nav.team":               { en: "Team",                 ar: "الفريق" },
  "nav.schedule":           { en: "Schedule",             ar: "الجدول" },
  "nav.exercises.lib":      { en: "Exercise Library",     ar: "مكتبة التمارين" },
  "nav.reports":            { en: "Reports",              ar: "التقارير" },
  "nav.navigation":         { en: "Navigation",           ar: "التنقل" },

  // ── Common ──────────────────────────────────────────────────────────────────
  "common.loading":         { en: "Loading…",             ar: "جاري التحميل…" },
  "common.save":            { en: "Save",                 ar: "حفظ" },
  "common.cancel":          { en: "Cancel",               ar: "إلغاء" },
  "common.close":           { en: "Close",                ar: "إغلاق" },
  "common.back":            { en: "Back",                 ar: "رجوع" },
  "common.search":          { en: "Search patients…",     ar: "البحث عن مريض…" },
  "common.refresh":         { en: "Refresh",              ar: "تحديث" },
  "common.addPatient":      { en: "Add Patient",          ar: "إضافة مريض" },
  "common.view":            { en: "View",                 ar: "عرض" },
  "common.notes":           { en: "Notes",                ar: "ملاحظات" },
  "common.active":          { en: "Active",               ar: "نشط" },
  "common.discharged":      { en: "Discharged",           ar: "مُخرَّج" },
  "common.on_hold":         { en: "On Hold",              ar: "معلق" },
  "common.all":             { en: "All",                  ar: "الكل" },
  "common.signOut":         { en: "Sign out",             ar: "تسجيل الخروج" },
  "common.patient":         { en: "Patient",              ar: "مريض" },
  "common.condition":       { en: "Condition",            ar: "الحالة" },
  "common.status":          { en: "Status",               ar: "الوضع" },
  "common.added":           { en: "Added",                ar: "تاريخ الإضافة" },
  "common.actions":         { en: "Actions",              ar: "إجراءات" },
  "common.showingOf":       { en: "Showing",              ar: "عرض" },
  "common.of":              { en: "of",                   ar: "من" },

  // ── Patient home ────────────────────────────────────────────────────────────
  "home.painChart":         { en: "Pain Level Progress",  ar: "تطور مستوى الألم" },
  "home.checkIn":           { en: "Daily Check-in",       ar: "تسجيل اليوم" },
  "home.streak":            { en: "Exercise Streak",      ar: "سلسلة التمارين" },
  "home.noSessions":        { en: "No session feedback yet", ar: "لا توجد جلسات مسجلة بعد" },

  // ── Exercises ───────────────────────────────────────────────────────────────
  "ex.program":             { en: "Exercise Program",     ar: "برنامج التمارين" },
  "ex.home":                { en: "Home Program",         ar: "برنامج منزلي" },
  "ex.clinic":              { en: "Clinic Program",       ar: "برنامج عيادة" },
  "ex.complete":            { en: "Complete",             ar: "إتمام" },
  "ex.completed":           { en: "Completed",            ar: "مكتمل" },
  "ex.markedByPhysio":      { en: "Marked by your physiotherapist", ar: "يُعلَّم من قبل المعالج" },

  // ── Appointments ────────────────────────────────────────────────────────────
  "appt.upcoming":          { en: "Upcoming appointments", ar: "المواعيد القادمة" },
  "appt.noAppts":           { en: "No upcoming appointments", ar: "لا توجد مواعيد قادمة" },
  "appt.book":              { en: "Book Appointment",     ar: "حجز موعد" },
};

function translate(key: string, lang: Lang): string {
  return translations[key]?.[lang] ?? translations[key]?.["en"] ?? key;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LanguageContext = createContext<LanguageContextValue>({
  lang:       "en",
  isRTL:      false,
  toggleLang: () => {},
  t:          (k) => k,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem("ph_lang") as Lang) ?? "en";
  });

  const isRTL = lang === "ar";

  // Apply dir + lang to the document root on every change
  useEffect(() => {
    document.documentElement.dir  = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("ph_lang", lang);
  }, [lang, isRTL]);

  const toggleLang = () => setLang((l) => (l === "en" ? "ar" : "en"));
  const t = (key: string) => translate(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, isRTL, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
