// ==========================================================
//  DigitalShopMm Telegram Bot
//  Admin Panel + User Panel + MongoDB Wallet System
// ==========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");

// ---------- ENV ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'nostalg14';
const CHANNEL_LINK = process.env.CHANNEL_LINK || 'https://t.me/your_channel';
const PORT = process.env.PORT || 3000;
const API_ID = parseInt(process.env.API_ID) || 17349;
const API_HASH = process.env.API_HASH || '344583e45741c457fe1862106095a5eb';

if (!BOT_TOKEN || !MONGO_URI || !ADMIN_ID) {
  console.error('BOT_TOKEN, MONGO_URI, ADMIN_ID တွေကို .env ထဲမှာ ဖြည့်ပါ');
  process.exit(1);
}

// ---------- PREMIUM EMOJI IDs ----------
const EMOTE = {
  WELCOME: '6260170796790980056',
  WALLET: '5328098344495490329',
  PRODUCTS: '5359805631320571519',
  MY_ORDERS: '5258011929993026890',
  ACCOUNT: '5323289282499064033',
  BALANCE: '5404359483155570991',
  JOIN_CHANNEL: '6113870986484913105',
  LANGUAGE: '5879585266426973039',
  REDEEM_CODE: '5359664288241829619',

  SELECT_PRODUCT: '4900189275326252171',
  SVC_TELEGRAM: '6257974552379270658',
  SVC_TELEGRAMM: '5472239203590888751',
  FLAG_MM: '6260246207826759565',
  FLAG_CO: '5294111658396895748',
  FLAG_US: '5987769694407368809',
  CHOOSE_FLAG: '6159042351537853617',
  TYPE_LABEL: '5298877105000439431',
  PRICE_LABEL: '6039495948353146588',
  INSTOCK_LABEL: '5323289282499064033',
  PAGE_LABEL: '5197219609970758159',
  TAP_FLAG: '5231102735817918643',

  BEFORE_BUY: '5864114012542736772',
  NEW_FLAG: '6158968370726179617',
  RESTRICTIONS: '5420323339723881652',
  BUY_NEW_FLAG: '5296369303661067030',
  GET_FLAG_HAPPY: '6114069998089539705',
  CHANGE_FLAG: '5352587852880302091',
  PRODUCT_DISCLAIMER: '6114141543654757519',
  READ_DISCLAIMER: '5769482310915199790',
  BACK: '6257789602497572109',

  DEPOSIT: '5222040745665379997',
  DEPOSIT_NEW: '5386757680679377085',
  MIN_AMOUNT: '5864114012542736772',
  KPAY_ICON: '6201684659458280710',
  WAVE_ICON: '6057728063049830775',
  PARTY: '5226791576495216962',
  ENTER_AMOUNT: '5987643272045010909',
  MAX_NOTICE: '5226645496067542621',
  SUBMITTED: '5201691993775818138',
  DEPOSIT_SUCCESS: '5253527915416539991',
  GET_OTP: '6217723016529316157',
  OUT_OF_STOCK_1: '5226700140936451703',
  OUT_OF_STOCK_2: '6260460969076465267',
  OUT_OF_STOCK_3: '6257789602497572109',
  COMMENT_QTY: '6115968287735026787',
  DONE_COMMENT: '6257974552379270658',
  DONE_ICON: '6257974552379270658',
  POST_LINK_ICON: '6260487164082005216',
};

// ---------- RANDOM PREMIUM EMOTE POOL ----------
const EMOTE_POOL = [
  { id: '6115968287735026787', ch: '🥰' },
  { id: '6257974552379270658', ch: '📱' },
  { id: '6260487164082005216', ch: '📢' },
];
const randEmote = () => EMOTE_POOL[Math.floor(Math.random() * EMOTE_POOL.length)];
const randIcon = () => randEmote().id;
const randTg = () => { const e = randEmote(); return `<tg-emoji emoji-id="${e.id}">${e.ch}</tg-emoji>`; };

if (process.env.EMOTE_MODE !== 'original') {
  for (const key of Object.keys(EMOTE)) {
    Object.defineProperty(EMOTE, key, { get: () => randIcon(), enumerable: true, configurable: true });
  }
}

// ---- Products / Countries data ----
const SERVICES = {
  telegram: { label: 'Buy Telegram Accounts', emoteId: EMOTE.SVC_TELEGRAM },
  telegramm: { label: 'Buy Telegram Comments', emoteId: EMOTE.SVC_TELEGRAMM },
};

const COMMENT_CATEGORIES = {
  boy: { label: 'Custom Boy Comment . 50ks', price: 50, emoteId: EMOTE.ACCOUNT },
  girl: { label: 'Custom Girl Comment . 70ks', price: 70, emoteId: EMOTE.ACCOUNT },
};

const COUNTRIES = [
  { code: 'mm', flag: '🇲🇲', dial: '+95', name: 'Myanmar', emoteId: EMOTE.FLAG_MM, labelSuffix: ' Account    .' },
  { code: 'co', flag: '🇨🇴', dial: '+57', name: 'Colombia', emoteId: EMOTE.FLAG_CO, labelSuffix: ' Account    .' },
  { code: 'us', flag: '🇺🇸', dial: '+1', name: 'UnitedState', emoteId: EMOTE.FLAG_US, labelSuffix: ' Account  .' },
];

const PRICES = { mm: 2000, co: 1700, us: 1500 };
const NUMBERS_PER_PAGE = 5;

// ---------- DB CONNECT ----------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ---------- SCHEMAS ----------
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: String,
  firstName: String,
  balance: { type: Number, default: 0 },
  language: { type: String, default: 'mm' },
  isBanned: { type: Boolean, default: false },
  orders: [
    {
      orderId: String,
      productName: String,
      phoneNumber: String,
      sessionText: String,
      amount: Number,
      status: { type: String, default: 'pending' },
      loginConfirmed: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

const redeemCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  maxUses: { type: Number, required: true },
  currentUses: { type: Number, default: 0 },
  usedBy: [Number],
  createdAt: { type: Date, default: Date.now },
});
const RedeemCode = mongoose.model('RedeemCode', redeemCodeSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
});
const Config = mongoose.model('Config', configSchema);

const commentAccountSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  sessionText: { type: String, required: true },
  gender: { type: String, enum: ['boy', 'girl'], required: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
});
const CommentAccount = mongoose.model('CommentAccount', commentAccountSchema);

const commentOrderSchema = new mongoose.Schema({
  orderId: String,
  userId: Number,
  type: String,
  quantity: Number,
  postLink: String,
  comments: [String],
  status: { type: String, default: 'processing' },
  processedCount: { type: Number, default: 0 },
  logs: [String],
  createdAt: { type: Date, default: Date.now },
});
const CommentOrder = mongoose.model('CommentOrder', commentOrderSchema);

const phoneNumberSchema = new mongoose.Schema({
  number: { type: String, required: true },
  service: { type: String, required: true },
  countryCode: { type: String, required: true },
  price: { type: Number, required: true },
  sessionText: { type: String, required: true },
  status: { type: String, default: 'available' },
  createdAt: { type: Date, default: Date.now },
});
const PhoneNumber = mongoose.model('PhoneNumber', phoneNumberSchema);

const paymentSettingsSchema = new mongoose.Schema({
  kbzNumber: { type: String, default: '09784214387' },
  kbzName: { type: String, default: 'Mg Wai Yan Tun' },
  waveNumber: { type: String, default: '09792310926' },
  waveName: { type: String, default: 'Min Oak Soe' },
});
const PaymentSettings = mongoose.model('PaymentSettings', paymentSettingsSchema);

async function getPaymentSettings() {
  let settings = await PaymentSettings.findOne();
  if (!settings) settings = await PaymentSettings.create({});
  return settings;
}

const depositRequestSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  method: { type: String, required: true },
  amountRequested: { type: Number, required: true },
  screenshotFileId: { type: String, required: true },
  status: { type: String, default: 'pending' },
  adminChatId: Number,
  adminMessageId: Number,
  createdAt: { type: Date, default: Date.now },
});
const DepositRequest = mongoose.model('DepositRequest', depositRequestSchema);

// ---------- HELPERS ----------
async function getOrCreateUser(from) {
  return await User.findOneAndUpdate(
    { telegramId: from.id },
    {
      $setOnInsert: { telegramId: from.id, createdAt: new Date() },
      $set: {
        username: from.username || '',
        firstName: from.first_name || '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function fmtKs(n) {
  return `${Number(n || 0).toLocaleString('en-US')} Ks`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Per-user OTP cooldown to avoid hammering Telegram and tripping rate limits
const otpCooldown = new Map(); // userId -> last request timestamp
const OTP_COOLDOWN_MS = 20000; // 20 seconds between Get OTP taps

async function processCommentOrder(orderId) {
  const order = await CommentOrder.findOne({ orderId });
  if (!order) return;

  const isNotiOn = (await Config.findOne({ key: 'admin_noti' }))?.value;
  const allAccounts = await CommentAccount.find({ gender: order.type, status: 'active' });
  if (allAccounts.length === 0) {
    if (isNotiOn) await bot.sendMessage(ADMIN_ID, `❌ Comment Order #${orderId} failed: No active accounts found.`);
    return;
  }

  const accounts = allAccounts.slice(0, order.quantity);
  const delays = [2 * 60 * 1000, 1 * 60 * 1000, 30 * 1000];
  let delayIdx = 0;

  for (let i = 0; i < order.quantity; i++) {
    const acc = accounts[i];
    const commentText = order.comments[i];

    await new Promise(r => setTimeout(r, delays[delayIdx]));
    delayIdx = (delayIdx + 1) % delays.length;

    try {
      const client = new TelegramClient(new StringSession(acc.sessionText), API_ID, API_HASH, { connectionRetries: 3 });
      await client.connect();

      let channelName = order.postLink.split('/').slice(-2, -1)[0];
      let postMsgId = parseInt(order.postLink.split('/').pop().split('?')[0]);

      const urlParams = new URLSearchParams(order.postLink.split('?')[1] || '');
      const directCommentId = urlParams.get('comment');

      let targetChat = channelName;
      let replyToMsgId = postMsgId;

      try {
        const discussion = await client.invoke(new Api.messages.GetDiscussionMessage({
          peer: channelName,
          msgId: postMsgId
        }));

        if (discussion && discussion.messages && discussion.messages.length > 0) {
          const discMsg = discussion.messages[0];
          replyToMsgId = discMsg.id;

          const linkedChat = discussion.chats.find(c =>
            c.id.toString() === discMsg.peerId.channelId?.toString() ||
            c.id.toString() === discMsg.peerId.chatId?.toString()
          );

          if (linkedChat) {
            targetChat = linkedChat;
          }
        }
      } catch (e) {
        console.log("GetDiscussionMessage failed:", e.message);
      }

      if (directCommentId) {
        replyToMsgId = parseInt(directCommentId);
      }

      try {
        await client.invoke(new Api.channels.JoinChannel({ channel: targetChat })).catch(() => {});
      } catch (e) {}
      await new Promise(r => setTimeout(r, 3000));

      await client.sendMessage(targetChat, {
        message: commentText,
        replyTo: replyToMsgId,
      });

      await client.disconnect();

      order.processedCount += 1;
      order.logs.push(`✅ [${acc.phoneNumber}] Success: ${commentText}`);
      await order.save();

      if (isNotiOn) {
        await bot.sendMessage(ADMIN_ID, `📝 <b>Comment Progress (#${orderId})</b>\nAcc: ${acc.phoneNumber}\nMsg: ${commentText}\nStatus: Success`, { parse_mode: 'HTML' });
      }

      if (order.processedCount === order.quantity) {
        const summaryMsg =
          `<tg-emoji emoji-id="${EMOTE.DONE_COMMENT}">📱</tg-emoji> <b>Done Comments</b>\n\n` +
          `<tg-emoji emoji-id="${EMOTE.POST_LINK_ICON}">📢</tg-emoji> <b>Post Link:</b> ${order.postLink}\n\n` +
          `<b>Comments Posted:</b>\n${order.comments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}`;
        await bot.sendMessage(order.userId, summaryMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
    } catch (err) {
      order.logs.push(`❌ [${acc.phoneNumber}] Fail: ${err.message}`);
      await order.save();

      if (isNotiOn) {
        await bot.sendMessage(ADMIN_ID, `⚠️ <b>Comment Fail (#${orderId})</b>\nAcc: ${acc.phoneNumber}\nMsg: ${commentText}\nError: ${err.message}\nLink: ${order.postLink}`, { parse_mode: 'HTML' });
      }
    }
  }

  order.status = 'completed';
  await order.save();

  await bot.sendMessage(
    order.userId,
    `<tg-emoji emoji-id="${EMOTE.DONE_ICON}">📱</tg-emoji><b>Done Comments</b>\n` +
    `<tg-emoji emoji-id="${EMOTE.POST_LINK_ICON}">📢</tg-emoji>Post Link - ${order.postLink}`,
    { parse_mode: 'HTML' }
  );
}

// ---------- KEYBOARD ----------
function mainMenuKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: 'Products', icon_custom_emoji_id: EMOTE.PRODUCTS }],
        [
          { text: 'My Orders', icon_custom_emoji_id: EMOTE.MY_ORDERS },
          { text: 'Account', icon_custom_emoji_id: EMOTE.ACCOUNT }
        ],
        [
          { text: 'Balance', icon_custom_emoji_id: EMOTE.BALANCE },
          { text: 'Join Channel', icon_custom_emoji_id: EMOTE.JOIN_CHANNEL }
        ],
        [
          { text: 'Language', icon_custom_emoji_id: EMOTE.LANGUAGE },
          { text: 'Redeem Code', icon_custom_emoji_id: EMOTE.REDEEM_CODE }
        ],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

function serviceSelectKeyboard() {
  return {
    inline_keyboard: [
      [{ text: SERVICES.telegram.label, callback_data: 'svc:telegram', icon_custom_emoji_id: SERVICES.telegram.emoteId }],
      [{ text: SERVICES.telegramm.label, callback_data: 'svc:telegramm', icon_custom_emoji_id: SERVICES.telegramm.emoteId }],
    ],
  };
}

function commentCategoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: COMMENT_CATEGORIES.boy.label, callback_data: 'cmcat:boy', icon_custom_emoji_id: randIcon() }],
      [{ text: COMMENT_CATEGORIES.girl.label, callback_data: 'cmcat:girl', icon_custom_emoji_id: randIcon() }],
    ],
  };
}

function countrySelectKeyboard(serviceKey) {
  const rows = COUNTRIES.map((c) => [
    {
      text: `${c.dial} ${c.name}${c.labelSuffix} ${PRICES[c.code]}ks`,
      callback_data: `country:${serviceKey}:${c.code}`,
      icon_custom_emoji_id: c.emoteId,
    },
  ]);
  rows.push([{ text: 'Back', callback_data: 'back_to_services', icon_custom_emoji_id: EMOTE.BACK }]);
  return { inline_keyboard: rows };
}

async function buildProductCard(serviceKey, country, requestedPage) {
  const filter = { service: serviceKey, countryCode: country.code, status: 'available' };
  const total = await PhoneNumber.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / NUMBERS_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  const numbers = await PhoneNumber.find(filter)
    .sort({ createdAt: 1 })
    .skip((page - 1) * NUMBERS_PER_PAGE)
    .limit(NUMBERS_PER_PAGE);

  const price = PRICES[country.code] || 0;
  const padLabel = (label) => label.padEnd(10, ' ');

  const text =
    `<tg-emoji emoji-id="${EMOTE.CHOOSE_FLAG}">➡️</tg-emoji>CHOOSE YOUR TELEGRAM ACCOUNT\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TYPE_LABEL}">🏷</tg-emoji> <b>${padLabel('Type')}:</b> ${country.flag}Account\n\n` +
    `🛍️ <b>${padLabel('Product')}:</b> Telegram Account\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji> <b>${padLabel('Price')}:</b> ${fmtKs(price)}\n\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji> <b>${padLabel('In stock')}:</b> ${total} accounts\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PAGE_LABEL}">📝</tg-emoji> Page ${page} of ${totalPages}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `<tg-emoji emoji-id="${EMOTE.TAP_FLAG}">👇</tg-emoji><b>Tap a phone number below to continue.</b>`;

  const rows = numbers.length
    ? numbers.map((n) => [
        {
          text: `${n.number}`,
          callback_data: `num:${n._id}:${serviceKey}:${country.code}:${page}`,
          icon_custom_emoji_id: country.emoteId,
        },
      ])
    : [
        [
          {
            text: 'OUT OF STOCK',
            callback_data: 'noop',
            icon_custom_emoji_id: EMOTE.OUT_OF_STOCK_1
          }
        ]
      ];

  const navRow = [];
  if (page > 1) {
    navRow.push({ text: 'Back', callback_data: `page:${serviceKey}:${country.code}:${page - 1}`, icon_custom_emoji_id: EMOTE.BACK });
  } else {
    navRow.push({ text: 'Back', callback_data: `svc:${serviceKey}`, icon_custom_emoji_id: EMOTE.BACK });
  }

  if (page < totalPages) {
    navRow.push({ text: 'Next', callback_data: `page:${serviceKey}:${country.code}:${page + 1}`, icon_custom_emoji_id: EMOTE.CHOOSE_FLAG });
  }

  if (navRow.length) rows.push(navRow);

  return { text, keyboard: { inline_keyboard: rows } };
}

async function buildPrePurchaseCard(phoneDoc, country, serviceKey, page) {
  const disclaimerLink = (await Config.findOne({ key: 'disclaimer_link' }))?.value || CHANNEL_LINK;
  const text =
    `<tg-emoji emoji-id="${EMOTE.BEFORE_BUY}">🔥</tg-emoji>BEFORE YOU BUY\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<tg-emoji emoji-id="${EMOTE.INSTOCK_LABEL}">📦</tg-emoji> Telegram ${country.name} Account\n\n` +
    `<tg-emoji emoji-id="${EMOTE.NEW_FLAG}">🏷</tg-emoji> New account\n\n` +
    `${country.flag} ${phoneDoc.number}\n` +
    `<tg-emoji emoji-id="${EMOTE.PRICE_LABEL}">🔖</tg-emoji> :${fmtKs(phoneDoc.price)}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `<tg-emoji emoji-id="${EMOTE.RESTRICTIONS}">⚠️</tg-emoji> Telegram restrictions are outside our control.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.BUY_NEW_FLAG}">🔒</tg-emoji> Request new login OTPs while the Bot remains connected.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.GET_FLAG_HAPPY}">✅</tg-emoji> Once you successfully log in, the account is under your control.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.CHANGE_FLAG}">✈️</tg-emoji> Change the email and 2FA immediately.\n\n` +
    `Tap “Accept & Buy” to continue.\n\n` +
    `<tg-emoji emoji-id="${EMOTE.PRODUCT_DISCLAIMER}">📌</tg-emoji> PRODUCT DISCLAIMER\n` +
    `Open the linked Telegram channel post and read it before confirming.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: 'Read Disclaimer', url: disclaimerLink, icon_custom_emoji_id: EMOTE.READ_DISCLAIMER }],
      [{ text: 'Accept & Buy', callback_data: `accept:${phoneDoc._id}:${serviceKey}:${country.code}:${page}`, icon_custom_emoji_id: EMOTE.GET_FLAG_HAPPY }],
      [{ text: 'Back', callback_data: `back:${serviceKey}:${country.code}:${page}`, icon_custom_emoji_id: EMOTE.BACK }],
    ],
  };
  return { text, keyboard };
}

// ---------- ADMIN COMMAND LIST ----------
const ADMIN_COMMANDS = [
  '/admin',
  '/addmoney',
  '/reducemoney',
  '/userinfo',
  '/ban',
  '/unban',
  '/setchannel',
  '/editkbz',
  '/editwave',
  '/redeemgen',
  '/dbstats',
  '/dbdel',
  '/stats',
  '/broadcast',
  '/addnumber',
  '/boycomment',
  '/girlcomment',
  '/checkphonenumber',
  '/on',
  '/off',
];

function isAdminCommand(text) {
  if (!text) return false;
  const cmd = text.trim().split(/\s+/)[0].toLowerCase();
  return ADMIN_COMMANDS.some((c) => cmd === c || cmd.startsWith(c + '@'));
}

// ==========================================================
//  BOT INIT
// ==========================================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.on('polling_error', (err) => console.error('Polling error:', err.message));

bot.setMyCommands([
  { command: 'start', description: '🍬 Main Menu ပြန်ဖွင့်ရန်' },
  { command: 'menu', description: '📋 Main Menu ပြန်ဖွင့်ရန်' },
]).catch((err) => console.error('setMyCommands error:', err.message));

bot.setChatMenuButton({ menu_button: { type: 'commands' } }).catch((err) =>
  console.error('setChatMenuButton error:', err.message)
);

const adminState = new Map();

// ---------- ADMIN: PREMIUM EMOJI ID FINDER ----------
bot.on('message', async (msg) => {
  try {
    if (!msg.from || msg.from.id !== ADMIN_ID) return;
    const src = msg.text || msg.caption || '';
    const ents = (msg.entities || msg.caption_entities || []).filter((e) => e.type === 'custom_emoji');
    if (!ents.length) return;
    const lines = ents.map((e) => {
      const ch = src.substr(e.offset, e.length);
      return `${ch}  <code>${e.custom_emoji_id}</code>\n<code>{ id: '${e.custom_emoji_id}', ch: '${ch}' },</code>`;
    });
    await bot.sendMessage(msg.chat.id, `🆔 <b>Premium Emoji IDs</b>\n\n${lines.join('\n\n')}`, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Emoji ID finder error:', e.message);
  }
});

// ---------- GLOBAL ADMIN GATE ----------
bot.on('message', async (msg) => {
  const text = msg.text || '';
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (isAdminCommand(text) && userId !== ADMIN_ID) return;

  const user = await getOrCreateUser(msg.from);
  if (user.isBanned && userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '❌ သင်သည် Bot အသုံးပြုခွင့် ပိတ်ပင်ခံထားရပါသည်။');
  }

  const depositState = userDepositState.get(userId);
  if (depositState) {
    const isMenuButton = ['Products', 'My Orders', 'Account', 'Balance', 'Join Channel', 'Language', 'Redeem Code'].includes(text);
    if (isMenuButton) {
      return bot.sendMessage(chatId, '📸 ငွေလွှဲ Screenshot (ပုံ) ကို ပို့ပေးပါ။ (သို့မဟုတ် ❌Cancel❌ ကိုနှိပ်ပါ)');
    }
  }

  // Admin Command Handlers
  if (userId === ADMIN_ID) {
    if (text.startsWith('/addmoney ')) {
      const [, targetId, amount] = text.split(' ');
      const target = await User.findOne({ telegramId: Number(targetId) });
      if (!target) return bot.sendMessage(chatId, '❌ User မတွေ့ပါ။');
      target.balance += Number(amount);
      await target.save();
      return bot.sendMessage(chatId, `✅ User ${targetId} ဆီ ${fmtKs(amount)} ထည့်ပေးလိုက်ပါပြီ။`);
    }
    if (text.startsWith('/reducemoney ')) {
      const [, targetId, amount] = text.split(' ');
      const target = await User.findOne({ telegramId: Number(targetId) });
      if (!target) return bot.sendMessage(chatId, '❌ User မတွေ့ပါ။');
      target.balance -= Number(amount);
      await target.save();
      return bot.sendMessage(chatId, `✅ User ${targetId} ဆီမှ ${fmtKs(amount)} နုတ်လိုက်ပါပြီ။`);
    }
    if (text.startsWith('/ban ')) {
      const targetId = text.split(' ')[1];
      await User.updateOne({ telegramId: Number(targetId) }, { isBanned: true });
      return bot.sendMessage(chatId, `✅ User ${targetId} ကို Ban လိုက်ပါပြီ။`);
    }
    if (text.startsWith('/unban ')) {
      const targetId = text.split(' ')[1];
      await User.updateOne({ telegramId: Number(targetId) }, { isBanned: false });
      return bot.sendMessage(chatId, `✅ User ${targetId} ကို Unban လိုက်ပါပြီ။`);
    }
    if (text.startsWith('/userinfo ')) {
      const targetId = text.split(' ')[1];
      const target = await User.findOne({ telegramId: Number(targetId) });
      if (!target) return bot.sendMessage(chatId, '❌ User မတွေ့ပါ။');
      return bot.sendMessage(chatId, `👤 <b>User Info</b>\nID: ${target.telegramId}\nUser: @${target.username}\nBalance: ${fmtKs(target.balance)}\nBanned: ${target.isBanned}`, { parse_mode: 'HTML' });
    }
    if (text.startsWith('/setchannel ')) {
      const url = text.split(' ')[1];
      await Config.updateOne({ key: 'channel_link' }, { value: url }, { upsert: true });
      return bot.sendMessage(chatId, `✅ Channel link ကို ${url} သို့ ပြောင်းလိုက်ပါပြီ။`);
    }
    if (text.startsWith('/setdisclaimer ')) {
      const url = text.split(' ')[1];
      await Config.updateOne({ key: 'disclaimer_link' }, { value: url }, { upsert: true });
      return bot.sendMessage(chatId, `✅ Disclaimer link ကို ${url} သို့ ပြောင်းလိုက်ပါပြီ။`);
    }
    if (text.startsWith('/editkbz ')) {
      const [, num, name] = text.split(' ');
      await Config.updateOne({ key: 'kbz_pay' }, { value: { number: num, name: name } }, { upsert: true });
      return bot.sendMessage(chatId, `✅ KBZ Pay ပြင်ပြီးပါပြီ။`);
    }
    if (text.startsWith('/editwave ')) {
      const [, num, name] = text.split(' ');
      await Config.updateOne({ key: 'wave_pay' }, { value: { number: num, name: name } }, { upsert: true });
      return bot.sendMessage(chatId, `✅ Wave Pay ပြင်ပြီးပါပြီ။`);
    }
    if (text.startsWith('/redeemgen ')) {
      const [, code, amount, maxUses] = text.split(' ');
      await RedeemCode.create({ code, amount: Number(amount), maxUses: Number(maxUses) });
      return bot.sendMessage(chatId, `✅ Redeem Code <code>${code}</code> ထုတ်ပြီးပါပြီ။ (${maxUses} users, ${amount} Ks)`, { parse_mode: 'HTML' });
    }
    if (text === '/dbstats') {
      const u = await User.countDocuments();
      const p = await PhoneNumber.countDocuments();
      const r = await RedeemCode.countDocuments();
      return bot.sendMessage(chatId, `📊 <b>Database Stats</b>\nUsers: ${u}\nNumbers: ${p}\nRedeem Codes: ${r}`, { parse_mode: 'HTML' });
    }
    if (text.startsWith('/dbdel ')) {
      const [, col, id] = text.split(' ');
      if (col === 'user') await User.deleteOne({ telegramId: Number(id) });
      if (col === 'phone') await PhoneNumber.deleteOne({ _id: id });
      if (col === 'redeem') await RedeemCode.deleteOne({ code: id });
      if (col === 'comment') await CommentAccount.deleteOne({ phoneNumber: id });
      return bot.sendMessage(chatId, `✅ Deleted from ${col}.`);
    }
    if (text === '/boycomment') {
      adminState.set(userId, { step: 'awaiting_comment_phone', gender: 'boy' });
      return bot.sendMessage(chatId, '👦 <b>Boy Comment Account</b> အတွက် ဖုန်းနံပါတ် ပို့ပေးပါ...', { parse_mode: 'HTML' });
    }
    if (text === '/girlcomment') {
      adminState.set(userId, { step: 'awaiting_comment_phone', gender: 'girl' });
      return bot.sendMessage(chatId, '👧 <b>Girl Comment Account</b> အတွက် ဖုန်းနံပါတ် ပို့ပေးပါ...', { parse_mode: 'HTML' });
    }
    if (text.startsWith('/checkphonenumber ')) {
      const phone = text.split(' ')[1];
      const acc = await CommentAccount.findOne({ phoneNumber: phone });
      if (!acc) return bot.sendMessage(chatId, '❌ ဤဖုန်းနံပါတ်ဖြင့် အကောင့်မရှိပါ။');

      try {
        const client = new TelegramClient(new StringSession(acc.sessionText), API_ID, API_HASH, { connectionRetries: 3 });
        await client.connect();
        const isAuth = await client.isUserAuthorized();
        await client.disconnect();
        return bot.sendMessage(chatId, `📱 <b>Account Status: ${phone}</b>\nAuthorized: ${isAuth ? '✅ Yes' : '❌ No'}\nStatus: ${acc.status}`, { parse_mode: 'HTML' });
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Error checking account: ${e.message}`);
      }
    }
    if (text === '/on') {
      await Config.updateOne({ key: 'admin_noti' }, { value: true }, { upsert: true });
      return bot.sendMessage(chatId, '✅ Admin Notification ဖွင့်လိုက်ပါပြီ။');
    }
    if (text === '/off') {
      await Config.updateOne({ key: 'admin_noti' }, { value: false }, { upsert: true });
      return bot.sendMessage(chatId, '❌ Admin Notification ပိတ်လိုက်ပါပြီ။');
    }
  }

  // Admin multi-step flows for comment accounts
  if (userId === ADMIN_ID) {
    const state = adminState.get(userId);
    if (state && state.step === 'awaiting_comment_phone') {
      adminState.set(userId, { ...state, step: 'awaiting_comment_session', phoneNumber: text.trim() });
      return bot.sendMessage(chatId, `✅ ဖုန်းနံပါတ် <code>${text.trim()}</code> အတွက် Session String (Token) ကို ပို့ပေးပါ...`, { parse_mode: 'HTML' });
    }
    if (state && state.step === 'awaiting_comment_session') {
      const sessionStr = text.trim();
      try {
        const client = new TelegramClient(new StringSession(sessionStr), API_ID, API_HASH, { connectionRetries: 1 });
        await client.connect();
        const isAuth = await client.isUserAuthorized();
        await client.disconnect();

        if (!isAuth) return bot.sendMessage(chatId, '❌ Session string မမှန်ကန်ပါ သို့မဟုတ် Unauthorized ဖြစ်နေပါသည်။');

        await CommentAccount.updateOne(
          { phoneNumber: state.phoneNumber },
          { sessionText: sessionStr, gender: state.gender, status: 'active' },
          { upsert: true }
        );
        adminState.delete(userId);
        return bot.sendMessage(chatId, `✅ ${state.gender === 'boy' ? '👦 Boy' : '👧 Girl'} Account <code>${state.phoneNumber}</code> ကို အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။`, { parse_mode: 'HTML' });
      } catch (e) {
        return bot.sendMessage(chatId, `❌ Error validating session: ${e.message}`);
      }
    }
  }

  // User Comment Multi-step Flow
  const state = adminState.get(userId);
  if (state) {
    if (state.step === 'awaiting_comment_qty') {
      const qtyStr = text.trim();
      if (!/^\d+$/.test(qtyStr)) return bot.sendMessage(chatId, '❌ Send only English number.');

      const qty = parseInt(qtyStr);
      if (qty < 1) return bot.sendMessage(chatId, '❌ Enter Minimum 1.');
      if (qty > state.stockCount) return bot.sendMessage(chatId, `❌ Maximum ${state.stockCount}.`);

      adminState.set(userId, { ...state, step: 'awaiting_comment_link', quantity: qty });
      return bot.sendMessage(chatId, '🔗 <b>Comment ထည့်မည့် Channel Post Link မှComment တစ်ခုLinkအားcopyယူပို့ပေးပါ......</b>', { parse_mode: 'HTML' });
    }

    if (state.step === 'awaiting_comment_link') {
      const link = text.trim();
      const channelPostRegex = /https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+/;
      const personalRegex = /https:\/\/t\.me\/[a-zA-Z0-9_]+$/;
      const commentLinkRegex = /\?comment=\d+/;

      if (personalRegex.test(link) && !channelPostRegex.test(link)) {
        return bot.sendMessage(chatId, '❌ Channel Link သာ ပို့ပေးပါ (Personal account link မရပါ)။');
      }

      if (!commentLinkRegex.test(link)) {
        return bot.sendMessage(chatId, '❌ Channel post link အောက်မှရေးထားသော comment link တစ်ခုကိုသာ copy ယူပို့ပါ');
      }

      if (!channelPostRegex.test(link)) {
        return bot.sendMessage(chatId, '❌ Link ပုံစံ မှားယွင်းနေပါသည်။ Link အမှန် ပြန်ပို့ပေးပါ။');
      }

      adminState.set(userId, { ...state, step: 'awaiting_comment_texts', postLink: link });

      let exampleLines = "";
      for (let i = 1; i <= Math.min(state.quantity, 2); i++) {
        exampleLines += `${i}. ${i === 1 ? 'Hello' : 'Test'}\n`;
      }

      const helpMsg =
        `✍️ <b>Custom Comment များ ပို့ပေးပါ</b>\n\n` +
        `အရေအတွက် <b>${state.quantity}</b> ခုအတွက် အောက်ပါအတိုင်း နံပါတ်စဉ်တပ်ပြီး ပို့ပေးပါ -\n` +
        `${exampleLines}\n` +
        `<i>(Bot မှ နံပါတ်စဉ်များကို ဖယ်ရှားပြီး စာသားကိုသာ မန့်ပေးမည်ဖြစ်သည်)</i>`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: 'HTML' });
    }

    if (state.step === 'awaiting_comment_texts') {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
      const parsedComments = lines.map(line => {
        return line.replace(/^\d+[\.\)]\s*/, '').trim();
      }).filter(c => c !== '');

      if (parsedComments.length < state.quantity) {
        return bot.sendMessage(chatId, `❌ Comment အရေအတွက် မပြည့်စုံပါ။ <b>${state.quantity}</b> ခု ပြည့်အောင် ပို့ပေးပါ။`, { parse_mode: 'HTML' });
      }

      const finalComments = parsedComments.slice(0, state.quantity);
      const pricePerCm = COMMENT_CATEGORIES[state.gender].price;
      const totalPrice = pricePerCm * state.quantity;

      const userDoc = await getOrCreateUser(msg.from);
      if (userDoc.balance < totalPrice) {
        adminState.delete(userId);
        return bot.sendMessage(chatId, `❌ Balance မလုံလောက်ပါ။ လိုအပ်သည်: ${fmtKs(totalPrice)}, လက်ရှိ: ${fmtKs(userDoc.balance)}`);
      }

      userDoc.balance -= totalPrice;
      const orderId = crypto.randomBytes(4).toString('hex');
      userDoc.orders.push({
        orderId: orderId,
        productName: `${state.gender === 'boy' ? '👦 Boy' : '👧 Girl'} Comment (${state.quantity} units)`,
        amount: totalPrice,
        status: 'processing',
        createdAt: new Date()
      });
      await userDoc.save();

      await CommentOrder.create({
        orderId,
        userId,
        type: state.gender,
        quantity: state.quantity,
        postLink: state.postLink,
        comments: finalComments,
      });

      adminState.delete(userId);
      await bot.sendMessage(chatId, `✅ <b>Order တင်ခြင်း အောင်မြင်ပါသည်!</b>\nComment များကို စတင်မန့်ပေးနေပါပြီ။ ပြီးစီးပါက အကြောင်းကြားပေးပါမည်။`, { parse_mode: 'HTML' });

      const isNotiOn = (await Config.findOne({ key: 'admin_noti' }))?.value;
      if (isNotiOn) {
        const adminMsg =
          `🔔 <b>New Comment Order</b>\n` +
          `Order ID: <code>#${orderId}</code>\n` +
          `User: @${msg.from.username || '-'}\n` +
          `Type: ${state.gender}\n` +
          `Qty: ${state.quantity}\n` +
          `Link: ${state.postLink}\n` +
          `Comments:\n<code>${finalComments.join('\n')}</code>`;
        await bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
      }

      processCommentOrder(orderId);
      return;
    }
  }

  // Redeem Code Step
  if (state && state.step === 'awaiting_redeem_code') {
    const codeStr = text.trim();
    const redeem = await RedeemCode.findOne({ code: codeStr });
    adminState.delete(userId);

    if (!redeem) return bot.sendMessage(chatId, '❌ မှားယွင်းသော Redeem Code ဖြစ်နေပါသည်။');
    if (redeem.usedBy.includes(userId)) return bot.sendMessage(chatId, '❌ သင်သည် ဤ Code ကို အသုံးပြုပြီးသား ဖြစ်ပါသည်။');
    if (redeem.currentUses >= redeem.maxUses) return bot.sendMessage(chatId, '❌ ဤ Code သည် အသုံးပြုနိုင်သည့် အကြိမ်အရေအတွက် ပြည့်သွားပါပြီ။');

    redeem.currentUses += 1;
    redeem.usedBy.push(userId);
    await redeem.save();
    user.balance += redeem.amount;
    await user.save();
    return bot.sendMessage(chatId, `🎉 <b>အောင်မြင်ပါသည်!</b>\nRedeem Code အသုံးပြုမှုကြောင့် ${fmtKs(redeem.amount)} ကို Wallet ထဲသို့ ထည့်သွင်းပေးလိုက်ပါပြီ။`, { parse_mode: 'HTML' });
  }
});

// ==========================================================
//  /admin
// ==========================================================
bot.onText(/^\/admin$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const adminHelp =
    `🛠 <b>Admin Panel Commands</b>\n\n` +
    `👤 <b>User Management</b>\n` +
    `• <code>/userinfo [userId]</code> - User အချက်အလက်ကြည့်ရန်\n` +
    `• <code>/addmoney [userId] [amount]</code> - ငွေထည့်ရန်\n` +
    `• <code>/reducemoney [userId] [amount]</code> - ငွေနုတ်ရန်\n` +
    `• <code>/ban [userId]</code> - User ကို Ban ရန်\n` +
    `• <code>/unban [userId]</code> - User ကို Unban ရန်\n\n` +
    `⚙️ <b>Settings</b>\n` +
    `• <code>/setchannel [url]</code> - Channel Link ပြောင်းရန်\n` +
    `• <code>/editkbz [number] [name]</code> - KBZ Pay ပြင်ရန်\n` +
    `• <code>/editwave [number] [name]</code> - Wave Pay ပြင်ရန်\n` +
    `• <code>/setdisclaimer [link]</code> - Disclaimer Link ပြင်ရန်\n\n` +
    `🎁 <b>Redeem Code</b>\n` +
    `• <code>/redeemgen [code] [amount] [maxUses]</code> - Code ထုတ်ရန်\n` +
    `<i>Example: /redeemgen 100ks 100 10</i>\n\n` +
    `📊 <b>Database & Stats</b>\n` +
    `• <code>/dbstats</code> - Database data အရေအတွက်ကြည့်ရန်\n` +
    `• <code>/dbdel [collection] [id]</code> - Data ဖျက်ရန်\n` +
    `<i>Collections: user, phone, redeem</i>\n\n` +
    `📢 <b>Other</b>\n` +
    `• <code>/broadcast [message]</code> - User အားလုံးဆီ စာပို့ရန်\n` +
    `• <code>/addnumber</code> - Number အသစ်ထည့်ရန်\n\n` +
    `💬 <b>Comment System</b>\n` +
    `• <code>/boycomment</code> - Boy Account အသစ်ထည့်ရန်\n` +
    `• <code>/girlcomment</code> - Girl Account အသစ်ထည့်ရန်\n` +
    `• <code>/checkphonenumber [number]</code> - Account အခြေအနေစစ်ရန်\n` +
    `• <code>/on</code> - Admin Noti ဖွင့်ရန်\n` +
    `• <code>/off</code> - Admin Noti ပိတ်ရန်\n` +
    `• <code>/setdisclaimer [link]</code> - Disclaimer Link ပြင်ရန်`;

  await bot.sendMessage(msg.chat.id, adminHelp, { parse_mode: 'HTML' });
});

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg.from);

  const welcomeText =
    `${randTg()}<b>DigitalShopMm မှ ကြိုဆိုပါတယ်</b>\n\n` +
    `🛍Digital Products နှင့် Services များကို ငွေဖြည့်သွင်းပြီး လိုချင်သည့် ပစ္စည်းကို တိုက်ရိုက် လျှင်မြန်စွာဝယ်ယူနိုင်ပါသည်🛍\n\n` +
    `<tg-emoji emoji-id="${EMOTE.WALLET}">💳</tg-emoji>Wallet Balance: ${fmtKs(user.balance)}`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(),
  });
});

bot.onText(/^\/menu$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getOrCreateUser(msg.from);

  const welcomeText =
    `${randTg()}<b>DigitalShopMm မှ ကြိုဆိုပါတယ်</b>\n\n` +
    `🛍Digital Products နှင့် Services များကို ငွေဖြည့်သွင်းပြီး လိုချင်သည့် ပစ္စည်းကို တိုက်ရိုက် လျှင်မြန်စွာဝယ်ယူနိုင်ပါသည်🛍\n\n` +
    `<tg-emoji emoji-id="${EMOTE.WALLET}">💳</tg-emoji>Wallet Balance: ${fmtKs(user.balance)}`;

  await bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    ...mainMenuKeyboard(),
  });
});

// ==========================================================
//  USER MENU HANDLERS
// ==========================================================
bot.onText(/^Products$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.SELECT_PRODUCT}">🖤</tg-emoji><b>Select a product:</b>`,
    { parse_mode: 'HTML', reply_markup: serviceSelectKeyboard() }
  );
});

// ---------- CALLBACK QUERY ----------
bot.on('callback_query', async (query) => {
  const data = query.data || '';
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    if (data === 'opendeposit') {
      await bot.sendMessage(chatId, 'ငွေဖြည့်ရန် နည်းလမ်းရွေးချယ်ပါ 👇', {
        reply_markup: depositMethodKeyboard(),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data.startsWith('deposit:')) {
      const method = data.split(':')[1];
      const info = await paymentInfoText(method);
      await bot.editMessageText(info.text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: info.reply_markup
      });
      userDepositState.set(query.from.id, { step: 'awaiting_screenshot', method });
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data.startsWith('svc:')) {
      const serviceKey = data.split(':')[1];
      if (serviceKey === 'telegramm') {
        await bot.editMessageReplyMarkup(commentCategoryKeyboard(), {
          chat_id: chatId,
          message_id: messageId,
        });
      } else {
        await bot.editMessageReplyMarkup(countrySelectKeyboard(serviceKey), {
          chat_id: chatId,
          message_id: messageId,
        });
      }
    } else if (data.startsWith('cmcat:')) {
      const gender = data.split(':')[1];
      const userDoc = await getOrCreateUser(query.from);
      const minPrice = COMMENT_CATEGORIES[gender].price;

      if (userDoc.balance < minPrice) {
        return bot.answerCallbackQuery(query.id, {
          text: `❌ Balance မလုံလောက်ပါ။ အနည်းဆုံး ${fmtKs(minPrice)} ရှိမှ ဝယ်ယူနိုင်ပါသည်။ ငွေဖြည့်သွင်းပြီးမှ ဆက်လက်လုပ်ဆောင်ပါ။`,
          show_alert: true
        });
      }

      const stockCount = await CommentAccount.countDocuments({ gender, status: 'active' });
      if (stockCount === 0) {
        return bot.answerCallbackQuery(query.id, { text: '❌ လက်ရှိတွင် အကောင့်များ ပြတ်လပ်နေပါသည်။', show_alert: true });
      }

      adminState.set(query.from.id, { step: 'awaiting_comment_qty', gender, stockCount });
      await bot.sendMessage(chatId, `<tg-emoji emoji-id="${EMOTE.COMMENT_QTY}">🥰</tg-emoji>မန့်မည့် Comment အရေအတွက် ပို့ပေးပါ... (Maximum: ${stockCount})`, { parse_mode: 'HTML' });
      await bot.answerCallbackQuery(query.id);
    } else if (data.startsWith('country:')) {
      const [, serviceKey, countryCode] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, 1);
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('page:')) {
      const [, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('num:')) {
      const [, id, serviceKey, countryCode, pageStr] = data.split(':');
      const phoneDoc = await PhoneNumber.findById(id);
      const country = COUNTRIES.find((c) => c.code === countryCode);
      if (!phoneDoc || phoneDoc.status !== 'available') {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ ဒီ Number ကို ရနိုင်တော့မည် မဟုတ်ပါ (ရောင်းပြီးသား ဖြစ်နိုင်ပါတယ်)။',
          show_alert: true,
        });
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }
      const { text, keyboard } = await buildPrePurchaseCard(phoneDoc, country, serviceKey, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('back:')) {
      const [, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('accept:')) {
      const [, id, serviceKey, countryCode, pageStr] = data.split(':');
      const country = COUNTRIES.find((c) => c.code === countryCode);
      const phoneDoc = await PhoneNumber.findById(id);

      if (!phoneDoc || phoneDoc.status !== 'available') {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ ဒီ Number ကို ရောင်းပြီးသား ဖြစ်နေပါပြီ။',
          show_alert: true,
        });
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      const user = await getOrCreateUser(query.from);
      if (user.balance < phoneDoc.price) {
        await bot.answerCallbackQuery(query.id, {
          text: `❌ Balance မလုံလောက်ပါ။ လက်ရှိလက်ကျန်: ${fmtKs(user.balance)}, လိုအပ်သည်: ${fmtKs(phoneDoc.price)}`,
          show_alert: true,
        });
        return;
      }

      const stillAvailable = await PhoneNumber.findOneAndUpdate(
        { _id: phoneDoc._id, status: 'available' },
        { status: 'sold' },
        { new: true }
      );
      if (!stillAvailable) {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ တစ်ဦးဦးက ရွေးသွားပြီးသား ဖြစ်နေပါတယ်။',
          show_alert: true,
        });
        const { text, keyboard } = await buildProductCard(serviceKey, country, Number(pageStr));
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: keyboard });
        return;
      }

      const orderId = crypto.randomBytes(4).toString('hex');
      const updatedUser = await User.findOneAndUpdate(
        { telegramId: query.from.id, balance: { $gte: phoneDoc.price } },
        {
          $inc: { balance: -phoneDoc.price },
          $push: {
            orders: {
              orderId: orderId,
              productName: `${country.flag}${country.dial} ${country.name} flag`,
              phoneNumber: phoneDoc.number,
              sessionText: phoneDoc.sessionText,
              amount: phoneDoc.price,
              status: 'completed',
              createdAt: new Date()
            }
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        await PhoneNumber.findOneAndUpdate({ _id: phoneDoc._id }, { status: 'available' });
        return bot.answerCallbackQuery(query.id, { text: '❌ Balance မလုံလောက်ပါ သို့မဟုတ် Error ဖြစ်ပွားခဲ့သည်။', show_alert: true });
      }

      await bot.answerCallbackQuery(query.id, {
        text: '🎉 Purchase successful!',
        show_alert: false,
      });

      const successText =
        `<tg-emoji emoji-id="${EMOTE.GET_FLAG_HAPPY}">✅</tg-emoji> <b>Purchase successful!</b>\n` +
        `Order: <code>#${orderId}</code>\n` +
        `Product: Account\n` +
        `Total: ${fmtKs(phoneDoc.price)}\n` +
        `Balance: ${fmtKs(updatedUser.balance)}\n` +
        `Phone: <code>${phoneDoc.number}</code>\n` +
        `2FA: <code>12345678@Nn</code>\n\n` +
        `<blockquote>Start Telegram login with this phone, then tap Get OTP. The bot checks for about 20 seconds and delivers one code</blockquote>\n\n` +
        `<blockquote>ယခု နံပါတ်နှင့် အကောင့်ဝင်ပါ ထို့နောက် get otpနိပ်၍ otp ရယူပါ ထို့နောက်botမှပေးသည့်otp codeအားရိုက်ထည့်ပါ\n` +
        `2step pswအား 2FAတွင်ပေးထားသည်</blockquote>`;

      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Get OTP', callback_data: `getotp:${orderId}`, icon_custom_emoji_id: EMOTE.GET_OTP }],
          ],
        },
      });
      return;
    } else if (data.startsWith('getotp:') || data.startsWith('resend:')) {
      const orderId = data.split(':')[1];
      const user = await getOrCreateUser(query.from);
      const order = user.orders.find(o => o.orderId === orderId);

      if (!order) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Order မတွေ့ပါ။', show_alert: true });
      }

      // Cooldown check — prevents hammering Telegram and triggering rate limits
      const lastOtpTime = otpCooldown.get(query.from.id) || 0;
      const now = Date.now();
      if (now - lastOtpTime < OTP_COOLDOWN_MS) {
        const remaining = Math.ceil((OTP_COOLDOWN_MS - (now - lastOtpTime)) / 1000);
        return bot.answerCallbackQuery(query.id, {
          text: `⏳ ခဏစောင့်ပါ... ${remaining} စက္ကန့်အကြာမှ ထပ်နိုင်ပါမယ်။`,
          show_alert: true,
        });
      }
      otpCooldown.set(query.from.id, now);

      // Answer callback immediately so the button spinner stops
      await bot.answerCallbackQuery(query.id);

      const waitingMsg = await bot
        .sendMessage(chatId, '⏳ Telegram မှ OTP ရယူနေပါတယ်... 20-60 seconds စောင့်ပေးပါ။')
        .catch(() => null);

      const cleanupWaiting = async () => {
        if (waitingMsg && waitingMsg.message_id) {
          await bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
        }
      };

      const resendKeyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Resend', callback_data: `resend:${orderId}`, icon_custom_emoji_id: EMOTE.GET_OTP }
          ]]
        }
      };

      try {
        // Hard cap the python process so the UI can never hang forever.
        // 90s > Python's own max (35 connect + 25 messages + 20 authz ≈ 80s).
        const { stdout, stderr } = await execPromise(
          `python3 otp_fetcher.py ${JSON.stringify(order.sessionText)}`,
          { timeout: 90000, maxBuffer: 1024 * 1024 }
        );

        await cleanupWaiting();

        if (stderr && stderr.trim()) {
          console.error('otp_fetcher stderr:', stderr.trim());
        }

        let result;
        try {
          result = JSON.parse((stdout || '').trim());
        } catch (parseErr) {
          console.error('otp_fetcher bad stdout:', stdout);
          return bot.sendMessage(
            chatId,
            '❌ OTP fetcher returned invalid output. ခဏနေမှ ပြန်ကြိုးစားပါ။',
            resendKeyboard
          );
        }

        if (result.error) {
          await bot.sendMessage(
            chatId,
            `❌ Error: ${result.error}\n\nOTP မရရှိသေးပါ။ Telegram တွင် OTP ပို့ထားခြင်း ရှိမရှိ စစ်ဆေးပြီး Resend ကို နှိပ်ပါ။`,
            resendKeyboard
          );
          return;
        }

        const orderTimeTs = order.createdAt.getTime() / 1000;
        let isNewLogin = false;
        if (result.latest_auth_date > orderTimeTs) {
          isNewLogin = true;
          if (!order.loginConfirmed) {
            await User.updateOne(
              { telegramId: user.telegramId, 'orders.orderId': order.orderId },
              { $set: { 'orders.$.loginConfirmed': true } }
            );
          }
        }

        if (!result.otp) {
          let msg = `OTP မရရှိသေးပါ။ Telegram တွင် OTP ပို့ထားခြင်း ရှိမရှိ စစ်ဆေးပြီး Resend ကို နှိပ်ပါ။`;
          if (isNewLogin) msg += `\n\n✅ <b>Successfully Login</b>`;

          await bot.sendMessage(chatId, msg, {
            parse_mode: 'HTML',
            ...resendKeyboard,
          });
        } else {
          const otpMatch = result.otp.text.match(/\d{5,6}/);
          const otpCode = otpMatch ? otpMatch[0] : result.otp.text;

          let otpText = `💰 <b>OTP Code:</b> <code>${otpCode}</code>\n` +
                        `🔒 <b>2step password:</b> <code>12345678@Nn</code>`;

          if (isNewLogin) {
            otpText += `\n\n✅ <b>Successfully Login</b>`;
          }

          await bot.sendMessage(chatId, otpText, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Copy OTP', copy_text: { text: otpCode } },
                  { text: 'Copy 2FA', copy_text: { text: '12345678@Nn' } }
                ],
                [{ text: 'Resend', callback_data: `resend:${orderId}`, icon_custom_emoji_id: EMOTE.GET_OTP }]
              ]
            }
          });
        }
      } catch (err) {
        console.error('OTP Fetch Error:', err);
        await cleanupWaiting();

        const isTimeout = err.killed || /timed?\s*out/i.test(err.message || '');
        const msg = isTimeout
          ? '⏱ OTP စစ်ဆေးရာတွင် အချိန်ကြာလွန်းနေပါသည်။ ခဏနေမှ Resend ကို နှိပ်ပါ။'
          : `❌ OTP စစ်ဆေးရာတွင် အမှားအယွင်းရှိနေပါသည်။\n${(err.message || '').slice(0, 200)}`;

        await bot.sendMessage(chatId, msg, resendKeyboard);
      }
      return;
    } else if (data.startsWith('copy:')) {
      const [, type, content] = data.split(':');
      await bot.answerCallbackQuery(query.id, { text: `Copied ${type}: ${content}`, show_alert: false });
      return;
    } else if (data.startsWith('confirm:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      const deposit = await DepositRequest.findById(depositId);
      if (!deposit || deposit.status !== 'pending') {
        await bot.answerCallbackQuery(query.id, { text: '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။', show_alert: true });
        return;
      }
      const depositUser = await getOrCreateUser({ id: deposit.userId });
      depositUser.balance += deposit.amountRequested;
      await depositUser.save();
      deposit.status = 'confirmed';
      await deposit.save();

      await bot
        .sendMessage(
          deposit.userId,
          `သွင်းငွေ ${fmtKs(deposit.amountRequested)} အောင်မြင်သည်<tg-emoji emoji-id="${EMOTE.DEPOSIT_SUCCESS}">🤟</tg-emoji>`,
          { parse_mode: 'HTML' }
        )
        .catch(() => {});

      await bot
        .editMessageCaption(`✅ Confirmed — ${fmtKs(deposit.amountRequested)} credited to user ${deposit.userId}.`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        })
        .catch((e) => console.error('editCaption error:', e.message));
      await bot.answerCallbackQuery(query.id, { text: '✅ Confirmed' });
      return;
    } else if (data.startsWith('editamt:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_edit_amount', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '💰 ဖြည့်ပေးမည့် Amount အသစ်ကို ရိုက်ထည့်ပါ (ဂဏန်းသာ)။');
      return;
    } else if (data.startsWith('cancelreply:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_cancel_reason', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '❌ Cancel ရတဲ့ အကြောင်းရင်းကို ရိုက်ပို့ပါ (user ဆီ ဒီအတိုင်း ပို့ပါမယ်)။');
      return;
    } else if (data.startsWith('editamtreply:')) {
      if (query.from.id !== ADMIN_ID) return void (await bot.answerCallbackQuery(query.id));
      const depositId = data.split(':')[1];
      adminState.set(ADMIN_ID, { step: 'awaiting_editreply_amount', depositId });
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(chatId, '💰 ဖြည့်ပေးမည့် Amount အသစ်ကို ရိုက်ထည့်ပါ (ဂဏန်းသာ)။');
      return;
    } else if (data.startsWith('orders:page:')) {
      const targetPage = Number(data.split(':')[2]);
      const user = await getOrCreateUser(query.from);
      if (!user.orders.length) {
        await bot.editMessageText(
          `<tg-emoji emoji-id="${EMOTE.MY_ORDERS}">📦</tg-emoji><b>My Orders</b>\n\nသင့်မှာ Order မရှိသေးပါ။`,
          { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
        );
      } else {
        const totalPages = Math.max(1, Math.ceil(user.orders.length / ORDERS_PER_PAGE));
        const page = Math.min(Math.max(1, targetPage), totalPages);

        const keyboard = { inline_keyboard: [] };
        if (totalPages > 1) {
          const navRow = [];
          if (page > 1) navRow.push({ text: 'Back', callback_data: `orders:page:${page - 1}`, icon_custom_emoji_id: EMOTE.BACK });
          if (page < totalPages) navRow.push({ text: 'Next', callback_data: `orders:page:${page + 1}`, icon_custom_emoji_id: EMOTE.CHOOSE_FLAG });
          if (navRow.length) keyboard.inline_keyboard.push(navRow);
        }

        await bot.editMessageText(ordersPageText(user, page, totalPages), {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data === 'back_to_services') {
      await bot.editMessageText('🖤 <b>Select a product:</b>', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: serviceSelectKeyboard(),
      });
      await bot.answerCallbackQuery(query.id);
      return;
    } else if (data === 'canceldeposit') {
      userDepositState.delete(query.from.id);
      await bot.answerCallbackQuery(query.id, { text: '❌ ငွေဖြည့်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။' });
      await bot.editMessageText('❌ ငွေဖြည့်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။ Main Menu ခလုတ်များကို ပြန်လည်အသုံးပြုနိုင်ပါသည်။', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    } else if (data === 'noop') {
      await bot.answerCallbackQuery(query.id);
      return;
    }
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('callback_query error:', err.message);
    bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

// ---------- MY ORDERS PAGINATION ----------
const ORDERS_PER_PAGE = 10;

function ordersPageText(user, page, totalPages) {
  const sortedOrders = [...user.orders].sort((a, b) => b.createdAt - a.createdAt);
  const pageOrders = sortedOrders.slice(
    (page - 1) * ORDERS_PER_PAGE,
    page * ORDERS_PER_PAGE
  );
  const globalIdx = (page - 1) * ORDERS_PER_PAGE;
  const list = pageOrders
    .map((o, i) => {
      let displayTitle = o.productName;
      if (displayTitle.includes('Myanmar')) displayTitle = '🇲🇲+95 Myanmar Account';
      else if (displayTitle.includes('UnitedState')) displayTitle = '🇺🇸+1 UnitedState Account';
      else if (displayTitle.includes('Colombia')) displayTitle = '🇨🇴+57 Colombia Account';

      return `${globalIdx + i + 1}. ${displayTitle} - ${fmtKs(o.amount)} [${o.status}]`;
    })
    .join('\n');

  return (
    `<tg-emoji emoji-id="${EMOTE.MY_ORDERS}">📦</tg-emoji><b>My Orders</b>\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📄 Page ${page} of ${totalPages}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${list}`
  );
}

async function sendOrdersPage(msg, user, requestedPage) {
  const totalPages = Math.max(1, Math.ceil(user.orders.length / ORDERS_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage || 1), totalPages);
  const keyboard = { inline_keyboard: [] };

  if (totalPages > 1) {
    const navRow = [];
    if (page > 1) navRow.push({ text: 'Back', callback_data: `orders:page:${page - 1}`, icon_custom_emoji_id: EMOTE.BACK });
    if (page < totalPages) navRow.push({ text: 'Next', callback_data: `orders:page:${page + 1}`, icon_custom_emoji_id: EMOTE.CHOOSE_FLAG });
    if (navRow.length) keyboard.inline_keyboard.push(navRow);
  }

  await bot.sendMessage(
    msg.chat.id,
    ordersPageText(user, page, totalPages),
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}

bot.onText(/^My Orders$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  if (!user.orders.length) {
    return bot.sendMessage(
      msg.chat.id,
      `<tg-emoji emoji-id="${EMOTE.MY_ORDERS}">📦</tg-emoji><b>My Orders</b>\n\nသင့်မှာ Order မရှိသေးပါ။`,
      { parse_mode: 'HTML' }
    );
  }
  await sendOrdersPage(msg, user, 1);
});

bot.onText(/^Account$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.ACCOUNT}">👤</tg-emoji><b>Account</b>\n\n` +
      `ID: ${user.telegramId}\n` +
      `Username: @${user.username || '-'}\n` +
      `Balance: ${fmtKs(user.balance)}\n` +
      `Language: ${user.language}\n` +
      `Joined: ${user.createdAt.toDateString()}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Balance$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.BALANCE}">👛</tg-emoji><b>Wallet Balance</b>\n\n` +
      `လက်ရှိ လက်ကျန်ငွေ: ${fmtKs(user.balance)}`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'ငွေဖြည့်ရန်', callback_data: 'opendeposit', icon_custom_emoji_id: EMOTE.DEPOSIT_NEW }]],
      },
    }
  );
});

bot.onText(/^Join Channel$/, async (msg) => {
  const channelLink = (await Config.findOne({ key: 'channel_link' }))?.value || CHANNEL_LINK;
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.JOIN_CHANNEL}">👋</tg-emoji><b>Join our Channel</b>\n\n${channelLink}`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Language$/, async (msg) => {
  const user = await getOrCreateUser(msg.from);
  const langLabel = user.language === 'en' ? 'English (en)' : 'Myanmar (mm)';
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.LANGUAGE}">🌐</tg-emoji><b>Language : ${langLabel}</b>`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/^Redeem Code$/, async (msg) => {
  await bot.sendMessage(
    msg.chat.id,
    `<tg-emoji emoji-id="${EMOTE.REDEEM_CODE}">🎁</tg-emoji><b>Redeem Code</b>\n\nAdmin ထံမှ ရရှိထားသော code ကို ရိုက်ပို့ပေးပါ...`,
    { parse_mode: 'HTML' }
  );
  adminState.set(msg.from.id, { step: 'awaiting_redeem_code' });
});

// ==========================================================
//  DEPOSIT / TOP-UP FLOW
// ==========================================================
const userDepositState = new Map();

function depositMethodKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'KBZ Pay ဖြင့်ငွေသွင်းမည်', callback_data: 'deposit:kbz', icon_custom_emoji_id: EMOTE.KPAY_ICON }],
      [{ text: 'Wave Pay ဖြင့်ငွေသွင်းမည်', callback_data: 'deposit:wave', icon_custom_emoji_id: EMOTE.WAVE_ICON }],
    ],
  };
}

async function paymentInfoText(method) {
  const kbz = (await Config.findOne({ key: 'kbz_pay' }))?.value || { number: '09784214387', name: 'Mg Wai Yan Tun' };
  const wave = (await Config.findOne({ key: 'wave_pay' }))?.value || { number: '09792310926', name: 'Min Oak Soe' };

  const line =
    method === 'kbz'
      ? `<tg-emoji emoji-id="${EMOTE.KPAY_ICON}">💵</tg-emoji> KPAY- ${kbz.number}`
      : `<tg-emoji emoji-id="${EMOTE.WAVE_ICON}">🆗</tg-emoji>WAVE Pay - ${wave.number}`;
  const name = method === 'kbz' ? kbz.name : wave.name;

  return {
    text: `<tg-emoji emoji-id="${EMOTE.MIN_AMOUNT}">🔥</tg-emoji>အနည်းဆုံး 1500 ကျပ်မှစဖြည့်ပါ\n\n` +
          `${line}\n` +
          `<tg-emoji emoji-id="${EMOTE.WELCOME}">🍬</tg-emoji>name - ${name}\n\n` +
          `ဆီသို့ ငွေလွဲပြီး screenshot ပို့ပေးပါ<tg-emoji emoji-id="${EMOTE.PARTY}">🤩</tg-emoji>`,
    reply_markup: {
      inline_keyboard: [[{ text: 'Cancel', callback_data: 'canceldeposit', icon_custom_emoji_id: randIcon() }]]
    }
  };
}

bot.onText(/^ငွေဖြည့်ရန်$/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'ငွေဖြည့်ရန် နည်းလမ်းရွေးချယ်ပါ 👇', {
    reply_markup: depositMethodKeyboard(),
  });
});

// ==========================================================
//  ADMIN COMMANDS
// ==========================================================
bot.onText(/^\/stats$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const totalUsers = await User.countDocuments();
  const agg = await User.aggregate([
    { $group: { _id: null, totalBalance: { $sum: '$balance' } } },
  ]);
  const totalBalance = agg[0]?.totalBalance || 0;
  await bot.sendMessage(
    msg.chat.id,
    `📊 Bot Stats\n\nTotal Users: ${totalUsers}\nTotal Wallet Balance (all users): ${fmtKs(totalBalance)}`
  );
});

bot.onText(/^\/broadcast ([\s\S]+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const text = match[1];
  const users = await User.find();
  let sent = 0;
  for (const u of users) {
    try {
      await bot.sendMessage(u.telegramId, text);
      sent++;
    } catch (e) {
      /* user blocked bot etc - skip */
    }
  }
  await bot.sendMessage(msg.chat.id, `✅ Broadcast ပို့ပြီးပါပြီ (${sent}/${users.length}).`);
});

bot.onText(/^\/cancel$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  if (adminState.has(ADMIN_ID)) {
    adminState.delete(ADMIN_ID);
    await bot.sendMessage(msg.chat.id, '❌ လက်ရှိ လုပ်ဆောင်နေမှုကို ရပ်လိုက်ပါပြီ။');
  } else {
    await bot.sendMessage(msg.chat.id, 'ရပ်စရာ လုပ်ဆောင်ချက် မရှိပါ။');
  }
});

bot.onText(/^\/addnumber$/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  adminState.set(ADMIN_ID, { step: 'awaiting_phone' });
  await bot.sendMessage(
    msg.chat.id,
    '📞 ထည့်မည့် Phone Number ကို ပို့ပါ (ဥပမာ - +95xxxxxxxxx)\n\nရပ်ချင်ရင် /cancel ရိုက်ပါ။'
  );
});

// Payment info edit commands
bot.onText(/^\/editkbznumber (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.kbzNumber = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ KBZ Pay Number ကို ${settings.kbzNumber} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editkbzname (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.kbzName = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ KBZ Pay Name ကို ${settings.kbzName} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editwavenumber (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.waveNumber = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ Wave Pay Number ကို ${settings.waveNumber} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

bot.onText(/^\/editwavename (.+)$/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const settings = await getPaymentSettings();
  settings.waveName = match[1].trim();
  await settings.save();
  await bot.sendMessage(msg.chat.id, `✅ Wave Pay Name ကို ${settings.waveName} အဖြစ် ပြင်ပြီးပါပြီ။`);
});

// Generic listener driving /addnumber and other admin multi-step flows
bot.on('message', async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const state = adminState.get(ADMIN_ID);
  if (!state) return;
  if (msg.text && msg.text.startsWith('/')) return;

  if (state.step === 'awaiting_phone') {
    const phone = (msg.text || '').trim();
    const country = COUNTRIES.find((c) => phone.startsWith(c.dial));
    if (!country) {
      return bot.sendMessage(
        msg.chat.id,
        `❌ ဒီ Phone Number ရဲ့ နိုင်ငံကုဒ်ကို မသိပါ (${COUNTRIES.map((c) => c.dial).join(', ')} တွေပဲ လက်ရှိထောက်ပံ့ထားပါတယ်)။ ပြန်ပို့ပါ။`
      );
    }
    adminState.set(ADMIN_ID, {
      step: 'awaiting_session',
      phone,
      countryCode: country.code,
      price: PRICES[country.code] || 0,
    });
    return bot.sendMessage(
      msg.chat.id,
      `✅ ${country.flag}${phone} ကို ${country.flag}${country.dial} ${country.name} Account (${fmtKs(
        PRICES[country.code] || 0
      )}) အုပ်စုထဲ ထည့်ပါမယ်။\n\n📄 ယခု Session ကို ပို့ပါ — .txt file အနေနဲ့ upload လုပ်လည်းရ / စာသားအနေနဲ့ တိုက်ရိုက်ရိုက်ပို့လည်း ရပါတယ်။`
    );
  }

  if (state.step === 'awaiting_session') {
    let sessionText = null;

    if (msg.document) {
      try {
        const fileLink = await bot.getFileLink(msg.document.file_id);
        const res = await fetch(fileLink);
        sessionText = await res.text();
      } catch (err) {
        console.error('session file download error:', err.message);
        return bot.sendMessage(msg.chat.id, '❌ File download မအောင်မြင်ပါ။ ပြန်ကြိုးစားပါ။');
      }
    } else if (msg.text) {
      sessionText = msg.text.trim();
    }

    if (!sessionText) {
      return bot.sendMessage(msg.chat.id, '❌ Session file (.txt) သို့မဟုတ် စာသားအနေနဲ့ ပို့ပါ။');
    }

    await PhoneNumber.create({
      number: state.phone,
      service: 'telegram',
      countryCode: state.countryCode,
      price: state.price,
      sessionText,
    });

    const country = COUNTRIES.find((c) => c.code === state.countryCode);
    adminState.delete(ADMIN_ID);
    return bot.sendMessage(
      msg.chat.id,
      `✅ ${country.flag}${state.phone} ကို session နဲ့အတူ ${country.flag}${country.dial} ${country.name} Account အုပ်စုထဲ ထည့်ပြီးပါပြီ။`
    );
  }

  if (state.step === 'awaiting_edit_amount' || state.step === 'awaiting_editreply_amount') {
    const amountText = (msg.text || '').trim();
    if (!/^[0-9]+$/.test(amountText)) {
      return bot.sendMessage(msg.chat.id, '❌ ဂဏန်းသာ ရိုက်ထည့်ပါ။');
    }
    const amount = Number(amountText);
    const deposit = await DepositRequest.findById(state.depositId);
    if (!deposit || deposit.status !== 'pending') {
      adminState.delete(ADMIN_ID);
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }

    if (state.step === 'awaiting_edit_amount') {
      deposit.amountRequested = amount;
      deposit.status = 'confirmed';
      await deposit.save();
      const depositUser = await getOrCreateUser({ id: deposit.userId });
      depositUser.balance += amount;
      await depositUser.save();
      adminState.delete(ADMIN_ID);

      await bot
        .sendMessage(
          deposit.userId,
          `သွင်းငွေ ${fmtKs(amount)} အောင်မြင်သည်<tg-emoji emoji-id="${EMOTE.DEPOSIT_SUCCESS}">🤟</tg-emoji>`,
          { parse_mode: 'HTML' }
        )
        .catch(() => {});
      if (deposit.adminChatId && deposit.adminMessageId) {
        await bot
          .editMessageCaption(`✅ Confirmed (edited) — ${fmtKs(amount)} credited to user ${deposit.userId}.`, {
            chat_id: deposit.adminChatId,
            message_id: deposit.adminMessageId,
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => {});
      }
      return bot.sendMessage(msg.chat.id, `✅ User ${deposit.userId} ဆီ ${fmtKs(amount)} ဖြည့်ပေးလိုက်ပါပြီ။`);
    }

    adminState.set(ADMIN_ID, { step: 'awaiting_editreply_message', depositId: state.depositId, amount });
    return bot.sendMessage(msg.chat.id, '✏️ User ဆီ ပို့ချင်တဲ့ Reply စာသားကို ရိုက်ပို့ပါ။');
  }

  if (state.step === 'awaiting_editreply_message') {
    const replyText = msg.text || '';
    if (!replyText.trim()) return bot.sendMessage(msg.chat.id, '❌ Reply စာသား ရိုက်ပို့ပါ။');

    const deposit = await DepositRequest.findById(state.depositId);
    adminState.delete(ADMIN_ID);
    if (!deposit || deposit.status !== 'pending') {
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }

    deposit.amountRequested = state.amount;
    deposit.status = 'confirmed';
    await deposit.save();
    const depositUser = await getOrCreateUser({ id: deposit.userId });
    depositUser.balance += state.amount;
    await depositUser.save();

    await bot.sendMessage(deposit.userId, replyText).catch(() => {});
    if (deposit.adminChatId && deposit.adminMessageId) {
      await bot
        .editMessageCaption(
          `✅ Confirmed (edited + replied) — ${fmtKs(state.amount)} credited to user ${deposit.userId}.`,
          { chat_id: deposit.adminChatId, message_id: deposit.adminMessageId, reply_markup: { inline_keyboard: [] } }
        )
        .catch(() => {});
    }
    return bot.sendMessage(msg.chat.id, `✅ ပြီးပါပြီ — User ${deposit.userId} ဆီ ${fmtKs(state.amount)} ဖြည့်ပြီး Reply ပါ ပို့ပြီးပါပြီ။`);
  }

  if (state.step === 'awaiting_cancel_reason') {
    const reason = msg.text || '';
    if (!reason.trim()) return bot.sendMessage(msg.chat.id, '❌ Cancel အကြောင်းရင်း ရိုက်ပို့ပါ။');

    const deposit = await DepositRequest.findById(state.depositId);
    adminState.delete(ADMIN_ID);
    if (!deposit || deposit.status !== 'pending') {
      return bot.sendMessage(msg.chat.id, '❌ ဒီ Deposit ကို လုပ်ဆောင်ပြီးသား ဖြစ်နေပါတယ်။');
    }
    deposit.status = 'cancelled';
    await deposit.save();

    await bot
      .sendMessage(
        deposit.userId,
        `ငွေဖြည့်သွင်းခြင်း မအောင်မြင်ပါ\nမအောင်မြင်ရသည့်အကြောင်းအရင်း : ${reason}`
      )
      .catch(() => {});
    if (deposit.adminChatId && deposit.adminMessageId) {
      await bot
        .editMessageCaption(`❌ Cancelled — reason: ${reason}`, {
          chat_id: deposit.adminChatId,
          message_id: deposit.adminMessageId,
          reply_markup: { inline_keyboard: [] },
        })
        .catch(() => {});
    }
    return bot.sendMessage(msg.chat.id, `❌ User ${deposit.userId} ရဲ့ Deposit ကို Cancel လုပ်ပြီး အကြောင်းကြားပြီးပါပြီ။`);
  }
});

// ==========================================================
//  USER-SIDE DEPOSIT SUBMISSION
// ==========================================================
bot.on('message', async (msg) => {
  const state = userDepositState.get(msg.from.id);
  if (!state) return;

  if (state.step === 'awaiting_screenshot') {
    if (!msg.photo || !msg.photo.length) {
      return bot.sendMessage(msg.chat.id, '📸 ငွေလွှဲ Screenshot (ပုံ) ကို ပို့ပေးပါ။');
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    userDepositState.set(msg.from.id, { step: 'awaiting_amount', method: state.method, fileId });
    await bot.sendMessage(
      msg.chat.id,
      `<tg-emoji emoji-id="${EMOTE.ENTER_AMOUNT}">➡️</tg-emoji>မိမိဖြည့်သွင်းထားသည့် ငွေamount အားရိုက်ထည့်ပါ`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (state.step === 'awaiting_amount') {
    const raw = (msg.text || '').trim();

    if (/[\u1040-\u1049]/.test(raw)) {
      return bot.sendMessage(msg.chat.id, 'English Number သာ ရိုက်ပေးပါ။ (ဥပမာ - 5000)');
    }
    if (!/^[0-9]+$/.test(raw) || raw.length > 9) {
      return bot.sendMessage(msg.chat.id, '🔢 ဂဏန်း (number) သာ ရိုက်ထည့်ပါ။');
    }

    const amount = Number(raw);
    if (amount > 100000) {
      return bot.sendMessage(
        msg.chat.id,
        `<tg-emoji emoji-id="${EMOTE.MAX_NOTICE}">🙋‍♀️</tg-emoji>Maximum ထည့်ရှိနိုင်သောပမာဏမှာ ၁သိန်း ကျပ်သာ ဖြစ်ပါသည်၊၊`,
        { parse_mode: 'HTML' }
      );
    }
    if (amount <= 0) {
      return bot.sendMessage(msg.chat.id, '🔢 မှန်ကန်တဲ့ ပမာဏကို ရိုက်ထည့်ပါ။');
    }

    const deposit = await DepositRequest.create({
      userId: msg.from.id,
      method: state.method,
      amountRequested: amount,
      screenshotFileId: state.fileId,
    });
    userDepositState.delete(msg.from.id);

    await bot.sendMessage(
      msg.chat.id,
      `သွင်းငွေ ${fmtKs(amount)} အား adminထံသို့ တင်ပြပေးထားပါတယ်။ မကြာမှီ adminမှ ငွေဖြည့်ပေးသွားမည်<tg-emoji emoji-id="${EMOTE.SUBMITTED}">🛫</tg-emoji>`,
      { parse_mode: 'HTML' }
    );

    const caption =
      `🧾 Deposit Request\n\n` +
      `User ID: ${msg.from.id}\n` +
      `Username: @${msg.from.username || '-'}\n` +
      `Method: ${state.method.toUpperCase()}\n` +
      `Amount: ${fmtKs(amount)}`;
    try {
      const sent = await bot.sendPhoto(ADMIN_ID, state.fileId, {
        caption,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: `confirm:${deposit._id}`, icon_custom_emoji_id: randIcon() },
              { text: '✏️ Edit Amount', callback_data: `editamt:${deposit._id}`, icon_custom_emoji_id: randIcon() },
            ],
            [
              { text: '❌ Cancel & Reply', callback_data: `cancelreply:${deposit._id}`, icon_custom_emoji_id: randIcon() },
              { text: '✏️ Edit Amount & Reply', callback_data: `editamtreply:${deposit._id}`, icon_custom_emoji_id: randIcon() },
            ],
          ],
        },
      });
      deposit.adminChatId = sent.chat.id;
      deposit.adminMessageId = sent.message_id;
      await deposit.save();
    } catch (err) {
      console.error('admin deposit notify error:', err.message);
    }
  }
});

// ==========================================================
//  EXPRESS HEALTH SERVER
// ==========================================================
const app = express();
app.get('/', (req, res) => res.send('DigitalShopMm Bot is running ✅'));
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.listen(PORT, () => console.log(`🌐 Health server listening on port ${PORT}`));

// ---------- BACKGROUND LOGIN CHECKER ----------
setInterval(async () => {
  try {
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const users = await User.find({
      'orders': {
        $elemMatch: {
          loginConfirmed: false,
          createdAt: { $gte: twentyMinsAgo },
          status: 'completed'
        }
      }
    });

    for (const user of users) {
      for (const order of user.orders) {
        if (!order.loginConfirmed && order.createdAt >= twentyMinsAgo && order.status === 'completed') {
          try {
            const { stdout } = await execPromise(
              `python3 otp_fetcher.py ${JSON.stringify(order.sessionText)}`,
              { timeout: 90000, maxBuffer: 1024 * 1024 }
            );
            const result = JSON.parse((stdout || '').trim());

            if (!result.error && result.latest_auth_date > 0) {
              const orderTimeTs = order.createdAt.getTime() / 1000;
              if (result.latest_auth_date > orderTimeTs) {
                await User.updateOne(
                  { telegramId: user.telegramId, 'orders.orderId': order.orderId },
                  { $set: { 'orders.$.loginConfirmed': true } }
                );

                await bot.sendMessage(
                  user.telegramId,
                  `✅ <b>Successfully Login</b>\n` +
                  `နံပါတ် <code>${order.phoneNumber}</code> ထဲသို့ User ဝင်ရောက်ခြင်း အောင်မြင်ပါသည်။`,
                  { parse_mode: 'HTML' }
                ).catch(() => {});
              }
            }
          } catch (err) {
            console.error(`Background Check Error for order ${order.orderId}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Global Background Checker Error:', err.message);
  }
}, 15 * 1000);

// ---------- SELF-PING ----------
const selfPing = () => {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) {
    console.warn('⚠️ RENDER_EXTERNAL_URL is not set. Self-ping skipped. Bot might sleep!');
    return;
  }

  const lib = url.startsWith('https') ? require('https') : require('http');
  lib.get(url, (res) => {
    console.log(`[${new Date().toISOString()}] Self-ping to ${url} - Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Self-ping failed:`, err.message);
  });
};

selfPing();
setInterval(selfPing, 5 * 60 * 1000);

console.log('🤖 Bot started (polling mode)...');
