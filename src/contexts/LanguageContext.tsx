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
  // Auth
  "auth.login":             { en: "Sign In",              ar: "تسجيل الدخول" },
  "auth.register":          { en: "Create Account",       ar: "إنشاء حساب" },
  "auth.logout":            { en: "Sign out",             ar: "تسجيل الخروج" },
  "auth.email":             { en: "Email address",        ar: "البريد الإلكتروني" },
  "auth.password":          { en: "Password",             ar: "كلمة المرور" },
  "auth.forgot":            { en: "Forgot password?",     ar: "نسيت كلمة المرور؟" },
  "auth.patient":           { en: "Patient",              ar: "مريض" },
  "auth.physio":            { en: "Physiotherapist",      ar: "معالج فيزيائي" },
  "auth.noAccount":         { en: "Don't have an account?", ar: "ليس لديك حساب؟" },
  "auth.hasAccount":        { en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
  "auth.signIn":            { en: "Sign in",              ar: "تسجيل الدخول" },

  // Register
  "reg.firstName":          { en: "First name",           ar: "الاسم الأول" },
  "reg.lastName":           { en: "Last name",            ar: "اسم العائلة" },
  "reg.dob":                { en: "Date of birth",        ar: "تاريخ الميلاد" },
  "reg.phone":              { en: "Phone number",         ar: "رقم الهاتف" },
  "reg.confirmPw":          { en: "Confirm password",     ar: "تأكيد كلمة المرور" },
  "reg.createAccount":      { en: "Create Account",       ar: "إنشاء الحساب" },
  "reg.step1":              { en: "Account details",      ar: "بيانات الحساب" },
  "reg.step2":              { en: "Personal info",        ar: "المعلومات الشخصية" },
  "reg.next":               { en: "Continue",             ar: "متابعة" },
  "reg.back":               { en: "Back",                 ar: "رجوع" },

  // Patient nav
  "nav.home":               { en: "Home",                 ar: "الرئيسية" },
  "nav.exercises":          { en: "Exercises",            ar: "التمارين" },
  "nav.appointments":       { en: "Appointments",         ar: "المواعيد" },
  "nav.patientSheet":       { en: "Patient Sheet",        ar: "ملف المريض" },
  "nav.feedback":           { en: "Feedback",             ar: "التقييم" },
  "nav.myPortal":           { en: "My Portal",            ar: "بوابتي" },

  // Physio nav
  "nav.overview":           { en: "Overview",             ar: "نظرة عامة" },
  "nav.patients":           { en: "Patients",             ar: "المرضى" },
  "nav.schedule":           { en: "Schedule",             ar: "الجدول" },
  "nav.exercises.lib":      { en: "Exercise Library",     ar: "مكتبة التمارين" },
  "nav.analytics":          { en: "Analytics",            ar: "التحليلات" },

  // Common
  "common.loading":         { en: "Loading…",             ar: "جاري التحميل…" },
  "common.save":            { en: "Save",                 ar: "حفظ" },
  "common.cancel":          { en: "Cancel",               ar: "إلغاء" },
  "common.close":           { en: "Close",                ar: "إغلاق" },
  "common.back":            { en: "Back",                 ar: "رجوع" },
  "common.search":          { en: "Search…",              ar: "بحث…" },
  "common.refresh":         { en: "Refresh",              ar: "تحديث" },
  "common.addPatient":      { en: "Add Patient",          ar: "إضافة مريض" },
  "common.view":            { en: "View",                 ar: "عرض" },
  "common.notes":           { en: "Notes",                ar: "ملاحظات" },
  "common.active":          { en: "Active",               ar: "نشط" },
  "common.discharged":      { en: "Discharged",           ar: "مُخرَّج" },
  "common.on_hold":         { en: "On Hold",              ar: "معلق" },
  "common.all":             { en: "All",                  ar: "الكل" },

  // Patient home
  "home.greeting":          { en: "Good",                 ar: "مرحباً" },
  "home.painChart":         { en: "Pain Level Progress",  ar: "تطور مستوى الألم" },
  "home.checkIn":           { en: "Daily Check-in",       ar: "تسجيل اليوم" },
  "home.streak":            { en: "Exercise Streak",      ar: "سلسلة التمارين" },
  "home.noSessions":        { en: "No session feedback yet", ar: "لا توجد جلسات مسجلة بعد" },

  // Appointments
  "appt.upcoming":          { en: "Upcoming appointments", ar: "المواعيد القادمة" },
  "appt.noAppts":           { en: "No upcoming appointments", ar: "لا توجد مواعيد قادمة" },
  "appt.book":              { en: "Book Appointment",     ar: "حجز موعد" },

  // Exercises
  "ex.program":             { en: "Exercise Program",     ar: "برنامج التمارين" },
  "ex.home":                { en: "Home Program",         ar: "برنامج منزلي" },
  "ex.clinic":              { en: "Clinic Program",       ar: "برنامج عيادة" },
  "ex.complete":            { en: "Complete",             ar: "إتمام" },
  "ex.completed":           { en: "Completed",            ar: "مكتمل" },
  "ex.markedByPhysio":      { en: "Marked by your physiotherapist", ar: "يُعلَّم من قبل المعالج" },
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
