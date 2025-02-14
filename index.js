// استيراد المكتبات المطلوبة
const TelegramBot = require('node-telegram-bot-api');

// ==== إعدادات البوت ====
// توكن البوت، معرف المجموعة (أو السوبرجروب) وأرقام هواتف الأدمن (بعد التنسيق)
const BOT_TOKEN = '7122455451:AAHOGbJ2XqcEQKdP1gHh_hmYjaWNwhd26Ic';
const GROUP_ID = '-1002280658346';  // تأكد أن هذا معرف مجموعة وليس قناة
const ADMIN_PHONES = ['0503405496'];

// قائمة الأدمن المبدئية (معرفات الدردشة)
const initialAdmins = [769668020];

// ==== إنشاء كائن البوت ====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==== تخزين الأدمن وحالة المستخدمين ====
// يتم حفظ قائمة الأدمن في الذاكرة فقط
const adminsMap = new Set(initialAdmins);
const userStates = {};

// ==== دالة لتنسيق رقم الهاتف ====
function standardizePhoneNumber(rawPhone) {
  let normalized = rawPhone.replace(/\D/g, '');
  console.log("الرقم الأصلي:", rawPhone, "بعد إزالة الرموز:", normalized);
  if (normalized.length === 12 && normalized.startsWith('966')) {
    normalized = '0' + normalized.slice(3);
    console.log("بعد تحويل مفتاح الدولة:", normalized);
  }
  return normalized;
}

// ==== دالة إعداد القائمة الدائمة (Persistent Menu) ====
// تمت إزالة زر "تجديد" بحيث يظهر فقط زر "اشتراك" مع باقي الأوامر
function getPersistentMenu(chatId) {
  const menu = [
    [{ text: 'اشتراك' }],
    [{ text: '/start' }, { text: 'مساعدة' }]
  ];
  if (adminsMap.has(chatId)) {
    menu.push([{ text: 'إرسال نص' }, { text: 'إرسال صورة' }]);
  }
  return {
    keyboard: menu,
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

// ==== دالة طلب مشاركة جهة الاتصال ====
function requestContact(chatId) {
  return bot.sendMessage(
    chatId,
    'للاشتراك يرجى مشاركة رقم هاتفك:',
    {
      reply_markup: {
        keyboard: [
          [{ text: 'مشاركة رقمي', request_contact: true }],
          [{ text: '/start' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
}

// ==== دالة إرسال رابط دعوة للمجموعة للمستخدمين غير المشتركين ====  
// صلاحية الرابط وصلاحيته لمدة يوم (86400 ثانية)
async function sendInviteLink(chatId) {
  try {
    const expireDate = Math.floor(Date.now() / 1000) + 86400; // صلاحية الرابط ليوم واحد
    const inviteLink = await bot.createChatInviteLink(GROUP_ID, {
      expire_date: expireDate,
      member_limit: 1,
    });
    await bot.sendMessage(
      chatId,
      `هذا رابط دعوة للمجموعة صالح لمدة يوم:\n${inviteLink.invite_link}`,
      { reply_markup: getPersistentMenu(chatId) }
    );
    // محاولة إلغاء رابط الدعوة بعد يوم (لضمان انتهاء صلاحيته)
    setTimeout(async () => {
      try {
        await bot.revokeChatInviteLink(GROUP_ID, inviteLink.invite_link);
        console.log(`تم إلغاء رابط الدعوة لـ ${chatId}`);
      } catch (err) {
        console.error('خطأ أثناء إلغاء رابط الدعوة:', err);
      }
    }, 86400 * 1000);
    // جدولة إنهاء الاشتراك (حذف العضوية) بعد يوم
    scheduleRemoval(chatId);
  } catch (err) {
    console.error('خطأ أثناء إنشاء رابط الدعوة:', err);
    await bot.sendMessage(
      chatId,
      'عذراً، حدث خطأ أثناء إنشاء رابط الاشتراك.',
      { reply_markup: getPersistentMenu(chatId) }
    );
  }
}

// ==== دالة جدولة انتهاء الاشتراك ====
// بعد يوم من الانضمام يتم حظر المستخدم (كخطوة لإنهاء الاشتراك)
// ثم بعد 5 ثوانٍ يتم رفع الحظر لإفساح المجال لإعادة الاشتراك
function scheduleRemoval(userId) {
  console.log(`سيتم إنهاء اشتراك المستخدم ${userId} بعد يوم واحد.`);
  setTimeout(() => {
    bot.banChatMember(GROUP_ID, userId)
      .then(() => {
        console.log(`تم حظر المستخدم ${userId} لإنهاء الاشتراك.`);
        // بعد 5 ثوانٍ نرفع الحظر ليسمح للمستخدم بالاشتراك مجددًا
        setTimeout(() => {
          bot.unbanChatMember(GROUP_ID, userId)
            .then(() => {
              console.log(`تم رفع الحظر عن المستخدم ${userId}. انتهت مدة اشتراكك.`);
              bot.sendMessage(
                userId,
                'انتهت مدة اشتراكك. لإعادة الاشتراك، يرجى الضغط على زر "اشتراك" في القائمة.',
                { reply_markup: getPersistentMenu(userId) }
              );
            })
            .catch(err => {
              console.error(`خطأ أثناء رفع الحظر عن المستخدم ${userId}:`, err);
            });
        }, 5000); // 5 ثوانٍ
      })
      .catch(err => {
        console.error(`خطأ أثناء حظر المستخدم ${userId}:`, err);
      });
  }, 86400 * 1000); // بعد يوم واحد (86400 ثانية)
}

// ==== أمر /start ====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'مرحباً بك في بوت التوصيات!', {
    reply_markup: getPersistentMenu(chatId)
  });
});

// ==== التعامل مع الرسائل الواردة ====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.is_bot) return;

  // عند مشاركة جهة الاتصال
  if (!adminsMap.has(chatId) && msg.contact) {
    const standardized = standardizePhoneNumber(msg.contact.phone_number);
    console.log(`تم استلام رقم الهاتف من ${chatId}: ${standardized}`);
    
    if (ADMIN_PHONES.includes(standardized)) {
      adminsMap.add(chatId);
      return bot.sendMessage(
        chatId,
        'تم التحقق من رقمك، أهلاً بك أيها الأدمن!',
        { reply_markup: getPersistentMenu(chatId) }
      );
    } else {
      // للمستخدم غير الأدمن: إرسال رابط الدعوة مع انتهاء الاشتراك بعد يوم
      return sendInviteLink(chatId);
    }
  }

  // حالات انتظار الإدخال من الأدمن (إرسال نص أو صورة)
  if (userStates[chatId] === 'WAITING_TEXT') {
    if (!adminsMap.has(chatId)) {
      return bot.sendMessage(
        chatId,
        'عذراً، هذه الخاصية للأدمن فقط.',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    const text = msg.text;
    userStates[chatId] = null;
    if (!text) {
      return bot.sendMessage(
        chatId,
        'لم يتم استلام نص صالح!',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    try {
      await bot.sendMessage(GROUP_ID, text);
      bot.sendMessage(
        chatId,
        'تم نشر النص في المجموعة!',
        { reply_markup: getPersistentMenu(chatId) }
      );
    } catch (err) {
      console.error('خطأ أثناء نشر النص:', err);
      bot.sendMessage(
        chatId,
        'عذراً، حدث خطأ أثناء نشر النص.',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    return;
  }
  
  if (userStates[chatId] === 'WAITING_PHOTO') {
    if (!adminsMap.has(chatId)) {
      return bot.sendMessage(
        chatId,
        'عذراً، هذه الخاصية للأدمن فقط.',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    if (!msg.photo) {
      return bot.sendMessage(
        chatId,
        'الرسالة لا تحتوي على صورة، حاول مرة أخرى.',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    const photoArray = msg.photo;
    const bestPhoto = photoArray[photoArray.length - 1].file_id;
    const caption = msg.caption || '';
    userStates[chatId] = null;
    try {
      await bot.sendPhoto(GROUP_ID, bestPhoto, { caption });
      bot.sendMessage(
        chatId,
        'تم نشر الصورة في المجموعة بنجاح!',
        { reply_markup: getPersistentMenu(chatId) }
      );
    } catch (err) {
      console.error('خطأ أثناء نشر الصورة:', err);
      bot.sendMessage(
        chatId,
        'عذراً، حدث خطأ أثناء نشر الصورة.',
        { reply_markup: getPersistentMenu(chatId) }
      );
    }
    return;
  }
  
  // ==== التعامل مع أوامر القائمة الدائمة عبر الرسائل النصية ====
  if (msg.text) {
    switch (msg.text) {
      case 'اشتراك':
        if (!adminsMap.has(chatId)) {
          bot.getChatMember(GROUP_ID, chatId)
            .then(member => {
              if (["member", "administrator", "creator"].includes(member.status)) {
                return bot.sendMessage(
                  chatId,
                  'أنت مشترك بالفعل. إذا انتهت مدة اشتراكك، سيُطلب منك الاشتراك مجددًا.',
                  { reply_markup: getPersistentMenu(chatId) }
                );
              } else {
                return requestContact(chatId);
              }
            })
            .catch(err => {
              console.error('خطأ عند التحقق من حالة الاشتراك:', err);
              return requestContact(chatId);
            });
        } else {
          return bot.sendMessage(
            chatId,
            'أنت أدمن بالفعل.',
            { reply_markup: getPersistentMenu(chatId) }
          );
        }
        break;
        
      case 'مساعدة':
        return bot.sendMessage(
          chatId,
          'لمزيد من المعلومات تفضل بزيارة موقعنا:\nhttps://3zzo.com',
          { reply_markup: getPersistentMenu(chatId) }
        );
        
      case 'إرسال نص':
        if (!adminsMap.has(chatId)) {
          return bot.sendMessage(
            chatId,
            'عذراً، هذه الخاصية للأدمن فقط.',
            { reply_markup: getPersistentMenu(chatId) }
          );
        }
        userStates[chatId] = 'WAITING_TEXT';
        return bot.sendMessage(
          chatId,
          'من فضلك أرسل النص الذي تريد نشره في المجموعة.',
          { reply_markup: getPersistentMenu(chatId) }
        );
        
      case 'إرسال صورة':
        if (!adminsMap.has(chatId)) {
          return bot.sendMessage(
            chatId,
            'عذراً، هذه الخاصية للأدمن فقط.',
            { reply_markup: getPersistentMenu(chatId) }
          );
        }
        userStates[chatId] = 'WAITING_PHOTO';
        return bot.sendMessage(
          chatId,
          'من فضلك أرسل الصورة التي تريد نشرها في المجموعة.',
          { reply_markup: getPersistentMenu(chatId) }
        );
        
      default:
        return bot.sendMessage(
          chatId,
          'يرجى اختيار أمر من القائمة المتوفرة.',
          { reply_markup: getPersistentMenu(chatId) }
        );
    }
  }
});
