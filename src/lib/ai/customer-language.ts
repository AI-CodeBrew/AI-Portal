export type CustomerReplyLanguage = "en" | "ar" | "roman";

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const ROMAN_URDU_HINT =
  /\b(kya|kia|hai|hain|he|ho|ka|ki|ke|ko|se|mein|main|mujhe|mujhay|aap|ap|batao|btao|bata|kitna|kitne|chahiye|chahte|chahenge|krna|karna|krdo|krlo|krlein|maloom|detail|details|bhai|behn|yeh|ye|wo|wala|wale|konsa|kesa|kesay|zara|shukriya|theek|thik|nahi|na|han|haan|ji|salam|assalam|dikhao|dikha|bhej|bhejo|mang|mangna|order|deliver|address|plz|please)\b/i;

const ROMAN_URDU_STRONG =
  /\b(kya|kia|kitna|kitne|batao|btao|chahiye|mujhe|maloom|krna|karna|krdo|nahi|haan|han|ji)\b/i;

function scoreMessage(text: string): {
  ar: number;
  roman: number;
  en: number;
} {
  const t = text.trim();
  if (!t) return { ar: 0, roman: 0, en: 0 };

  const arabicChars = (t.match(new RegExp(ARABIC_SCRIPT.source, "g")) ?? [])
    .length;
  if (arabicChars >= 2) {
    return { ar: arabicChars * 3, roman: 0, en: 0 };
  }

  const romanHits = (t.match(new RegExp(ROMAN_URDU_HINT.source, "gi")) ?? [])
    .length;
  if (romanHits >= 2 || (romanHits >= 1 && ROMAN_URDU_STRONG.test(t))) {
    return { ar: 0, roman: romanHits + 2, en: 0 };
  }

  return { ar: arabicChars, roman: romanHits, en: 1 };
}

/** Detect reply language from recent customer messages (English, Roman Urdu, Arabic). */
export function detectCustomerLanguage(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestMessage?: string
): CustomerReplyLanguage {
  const userTexts = history
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content);
  if (latestMessage?.trim()) userTexts.push(latestMessage.trim());

  let ar = 0;
  let roman = 0;
  let en = 0;

  for (let i = 0; i < userTexts.length; i++) {
    const weight = i === userTexts.length - 1 ? 3 : 1;
    const s = scoreMessage(userTexts[i]!);
    ar += s.ar * weight;
    roman += s.roman * weight;
    en += s.en * weight;
  }

  if (ar >= roman && ar >= 2) return "ar";
  if (roman >= 3 && roman >= en) return "roman";
  return "en";
}

export function languagePromptBlock(lang: CustomerReplyLanguage): string {
  if (lang === "ar") {
    return `\n\nCRITICAL — language:
- The customer writes in Arabic. Reply entirely in natural Arabic (Modern Standard or Gulf-friendly).
- Keep product names, SKUs, and price_formatted as returned by tools.
- Use Arabic for greetings, explanations, and calls to action.`;
  }
  if (lang === "roman") {
    return `\n\nCRITICAL — language:
- The customer writes in Roman Urdu / Urdu in English letters (e.g. "kitna hai", "batao", "order krna hai").
- Reply in the same Roman Urdu style — friendly Pakistani WhatsApp tone, not formal Urdu script.
- Keep product names, SKUs, and price_formatted as returned by tools.`;
  }
  return `\n\nCRITICAL — language:
- The customer writes in English. Reply in clear, friendly English.
- If they switch to Arabic or Roman Urdu later, match their language in the next reply.`;
}

type MsgKey =
  | "productNotFound"
  | "skuNotFound"
  | "wantToOrder"
  | "multipleMatches"
  | "price"
  | "sku"
  | "stockAvailable"
  | "stockOut"
  | "bundles"
  | "variant"
  | "outOfStock"
  | "orderDetailsIntro"
  | "orderName"
  | "orderPhone"
  | "orderAddress"
  | "orderQty"
  | "orderVariant"
  | "checkoutNeedDetails"
  | "checkoutWhichProduct"
  | "checkoutFailed"
  | "orderConfirmed"
  | "qty"
  | "discountApplied"
  | "total"
  | "confirmationSent"
  | "thanks"
  | "recoveryPersonalDiscount"
  | "recoveryPersonalBundle"
  | "recoveryFlatOff"
  | "recoveryBundleTitle"
  | "recoveryReplyYes"
  | "recoveryLockedDiscount"
  | "recoveryLockedBundle"
  | "recoveryHardStop"
  | "recoveryFinalThanks"
  | "complaintEmpathy"
  | "complaintAskPhotoOrder"
  | "oosWithSimilar"
  | "oosNoSimilarNotify"
  | "oosNotifyConfirmed";

const MESSAGES: Record<MsgKey, Record<CustomerReplyLanguage, string>> = {
  productNotFound: {
    en: "Couldn't find that product. Send the name or SKU again?",
    ar: "لم أجد هذا المنتج. أرسل الاسم أو رمز المنتج مرة أخرى.",
    roman: "Yeh product nahi mila. Naam ya SKU dubara bhej dein?",
  },
  skuNotFound: {
    en: "I couldn't find a product with SKU {sku}. Please double-check the code or tell me the product name.",
    ar: "لم أجد منتجاً برمز {sku}. تأكد من الرمز أو أرسل اسم المنتج.",
    roman: "SKU {sku} wala product nahi mila. Code check karein ya product ka naam bhej dein.",
  },
  wantToOrder: {
    en: "Want to order?",
    ar: "هل تريد الطلب؟",
    roman: "Order karna hai?",
  },
  multipleMatches: {
    en: "Found {count} matches — which one?",
    ar: "وجدت {count} نتائج — أي واحد تريد؟",
    roman: "{count} products mile — kaunsa chahiye?",
  },
  price: { en: "Price:", ar: "السعر:", roman: "Price:" },
  sku: { en: "SKU:", ar: "الرمز:", roman: "SKU:" },
  stockAvailable: {
    en: "Stock: available",
    ar: "المخزون: متوفر",
    roman: "Stock: available hai",
  },
  stockOut: {
    en: "Stock: out of stock",
    ar: "المخزون: غير متوفر",
    roman: "Stock: khatam / out of stock",
  },
  bundles: { en: "Bundles:", ar: "الباقات:", roman: "Bundles:" },
  variant: { en: "Variant", ar: "النوع", roman: "Variant" },
  outOfStock: {
    en: "(out of stock)",
    ar: "(غير متوفر)",
    roman: "(stock nahi)",
  },
  orderDetailsIntro: {
    en: "For order mention:",
    ar: "للطلب أرسل:",
    roman: "Order ke liye yeh bhejein:",
  },
  orderName: { en: "Name:", ar: "الاسم:", roman: "Name:" },
  orderPhone: { en: "Phone:", ar: "الهاتف:", roman: "Phone:" },
  orderAddress: { en: "Address:", ar: "العنوان:", roman: "Address:" },
  orderQty: { en: "Qty:", ar: "الكمية:", roman: "Qty:" },
  orderVariant: {
    en: "Variant: size/color",
    ar: "النوع: المقاس/اللون",
    roman: "Variant: size/color",
  },
  checkoutNeedDetails: {
    en: "I can place that order — please send your details like this:",
    ar: "يمكنني تسجيل الطلب — أرسل بياناتك بهذا الشكل:",
    roman: "Order place ho sakta hai — apni details is format mein bhej dein:",
  },
  checkoutWhichProduct: {
    en: "I have your details. Which product should I order? Please send the product name or SKU again.",
    ar: "لدي بياناتك. أي منتج تريد طلبه؟ أرسل الاسم أو الرمز مرة أخرى.",
    roman: "Aap ki details mil gayi. Kaunsa product order karna hai? Naam ya SKU dubara bhej dein.",
  },
  checkoutFailed: {
    en: "I couldn't complete the order yet ({error}). Please confirm the product SKU/name and your address, or wait for a team member.",
    ar: "لم أتمكن من إكمال الطلب ({error}). تأكد من المنتج والعنوان أو انتظر أحد الفريق.",
    roman: "Abhi order complete nahi ho saka ({error}). Product SKU/naam aur address confirm karein, ya team member ka wait karein.",
  },
  orderConfirmed: {
    en: "✅ Order *{order}* confirmed",
    ar: "✅ تم تأكيد الطلب *{order}*",
    roman: "✅ Order *{order}* confirm ho gaya",
  },
  qty: { en: "Qty:", ar: "الكمية:", roman: "Qty:" },
  discountApplied: {
    en: "{percent}% off applied",
    ar: "تم تطبيق خصم {percent}%",
    roman: "{percent}% discount lag gaya",
  },
  total: { en: "Total:", ar: "الإجمالي:", roman: "Total:" },
  confirmationSent: {
    en: "Confirmation sent to {phone}",
    ar: "تم إرسال التأكيد إلى {phone}",
    roman: "Confirmation {phone} par bhej di",
  },
  thanks: {
    en: "Thanks, {name}!",
    ar: "شكراً {name}!",
    roman: "Shukriya {name}!",
  },
  recoveryPersonalDiscount: {
    en: "I wanted to personally offer you *{percent}% off* on *{product}* — *{now}* instead of {was}.",
    ar: "أود أن أقدم لك خصماً *{percent}%* على *{product}* — *{now}* بدلاً من {was}.",
    roman: "Main aap ko *{product}* par *{percent}% off* offer karna chahta hoon — *{now}* ki bajaye {was}.",
  },
  recoveryPersonalBundle: {
    en: "I wanted to personally offer you a *2-pack bundle ({percent}% off)* on *{product}* — *{now}* instead of {was}.",
    ar: "أود أن أقدم لك *باقة من قطعتين (خصم {percent}%)* على *{product}* — *{now}* بدلاً من {was}.",
    roman: "Main aap ko *{product}* par *2-pack bundle ({percent}% off)* offer karna chahta hoon — *{now}* ki bajaye {was}.",
  },
  recoveryFlatOff: {
    en: "⚡ Limited WhatsApp deal — reply *YES* to grab it:",
    ar: "⚡ عرض واتساب محدود — رد *YES* للحصول عليه:",
    roman: "⚡ Limited WhatsApp deal — *YES* likh dein:",
  },
  recoveryBundleTitle: {
    en: "🎁 Best value — reply *YES* to lock it:",
    ar: "🎁 أفضل قيمة — رد *YES* لتثبيت العرض:",
    roman: "🎁 Best value — *YES* likh kar lock kar lein:",
  },
  recoveryReplyYes: {
    en: "reply *YES*",
    ar: "رد *YES*",
    roman: "*YES* likhein",
  },
  recoveryLockedDiscount: {
    en: "🔥 Deal locked: *{percent}% OFF*",
    ar: "🔥 تم تثبيت العرض: *خصم {percent}%*",
    roman: "🔥 Deal lock: *{percent}% OFF*",
  },
  recoveryLockedBundle: {
    en: "🔥 Locked in: *2-PACK* at *{percent}% OFF*",
    ar: "🔥 تم التثبيت: *باقة 2* بخصم *{percent}%*",
    roman: "🔥 Lock ho gaya: *2-PACK* *{percent}% OFF* par",
  },
  recoveryHardStop: {
    en: "Okay — I won't push. Message anytime if you need help.",
    ar: "حسناً — لن أزعجك. راسلني في أي وقت إذا احتجت مساعدة.",
    roman: "Theek hai — ab push nahi karunga. Kabhi bhi message kar dein.",
  },
  recoveryFinalThanks: {
    en: "No problem — thanks for checking {product}. Message anytime if you need anything.",
    ar: "لا مشكلة — شكراً لاهتمامك بـ {product}. راسلني في أي وقت.",
    roman: "Koi baat nahi — {product} dekhne ka shukriya. Kabhi bhi message kar dein.",
  },
  complaintEmpathy: {
    en: "I'm really sorry to hear that — that's not the experience we want you to have.",
    ar: "أنا آسف جداً لسماع ذلك — هذه ليست التجربة التي نريدها لك.",
    roman: "Sun kar bohot afsoos hua — yeh woh experience nahi jo hum chahte.",
  },
  complaintAskPhotoOrder: {
    en: "Could you send a quick photo of the damage? And to pull up your order, can you confirm the order number or the name it was placed under?\n\nOnce I see that, I'll get a replacement or refund sorted for you right away.",
    ar: "هل يمكنك إرسال صورة سريعة للضرر؟ وللبحث عن طلبك، أكّد رقم الطلب أو الاسم الذي تم الطلب باسمه.\n\nبمجرد أن أرى ذلك، سأرتب لك استبدالاً أو استرداداً فوراً.",
    roman: "Damage ki ek photo bhej dein? Aur order dhundne ke liye order number ya naam confirm kar dein jis naam se order kiya tha.\n\nJaise hi mil jaye, replacement ya refund turant sort kar dunga.",
  },
  oosWithSimilar: {
    en: "That one's actually out of stock right now, sorry! But we have *{similar}* in a very similar style if you'd like to see it — or I can let you know the moment this one's back, whichever you'd prefer.",
    ar: "عذراً — هذا المنتج غير متوفر حالياً! لكن لدينا *{similar}* بنفس الأسلوب تقريباً إن أردت — أو أخبرك فور عودته للمخزون، كما تفضل.",
    roman: "Sorry — yeh abhi out of stock hai! Lekin *{similar}* bohot similar style mein hai agar dekhna ho — ya jab wapas aaye bata dun, jo pasand ho.",
  },
  oosNoSimilarNotify: {
    en: "That one's actually out of stock right now, sorry! I don't have a close match in stock — but I can let you know the moment *{product}* is back. Just say *notify me*.",
    ar: "عذراً — هذا المنتج غير متوفر حالياً! لا يوجد بديل قريب — لكن سأخبرك عند عودة *{product}*. اكتب *notify me*.",
    roman: "Sorry — yeh abhi out of stock hai! Close match nahi hai — lekin *{product}* aate hi bata dunga. *notify me* likh dein.",
  },
  oosNotifyConfirmed: {
    en: "Done — I'll message you on WhatsApp as soon as *{product}* is back in stock.",
    ar: "تم — سأراسلك على واتساب فور عودة *{product}* للمخزون.",
    roman: "Theek hai — *{product}* stock mein aate hi WhatsApp par message kar dunga.",
  },
};

export function customerMsg(
  key: MsgKey,
  lang: CustomerReplyLanguage,
  vars?: Record<string, string | number>
): string {
  let text = MESSAGES[key][lang] ?? MESSAGES[key].en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/** Roman Urdu / Arabic product question cues for direct catalog lookup. */
export const MULTILINGUAL_PRODUCT_ASK =
  /\b(kitna|kitne|kya|kia|batao|btao|maloom|detail|details|chahiye|dikhao|dikha|price|cost|سعر|بكم|كم|متوفر|منتج|تفاصيل|موجود)\b/i;

export const MULTILINGUAL_DECLINE =
  /\b(nahi|na|mat|baad|later|shayad|mehnga|mehng|zyada|afford|nahi\s+chahiye|لا|مو|مش|غالي|بعدين|لا\s+شكر)\b/i;

export const MULTILINGUAL_ACCEPT =
  /\b(haan|han|ji|yes|ok|okay|theek|thik|done|deal|lock|krdo|kr\s*do|kr\s*lo|kr\s*lein|ہاں|نعم|تمام|اوكي)\b/i;

export const MULTILINGUAL_GREETING =
  /^(hi|hello|hey|salam|assalam|السلام|مرحب|thanks|thank you|shukriya|شكر|ok|okay|yes|no|han|haan|ji)[\s!.]*$/i;
