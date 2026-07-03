// Sends transactional email AND SMS via Brevo (formerly Sendinblue) REST API.
// Email docs: https://developers.brevo.com/reference/sendtransacemail
// SMS docs:   https://developers.brevo.com/reference/sendtransacsms

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

const emailConfigured = () =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

const smsConfigured = () =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER);

const sendStatusEmail = async ({ to, subject, message }) => {
  if (!emailConfigured() || !to) {
    console.log('Email notification skipped:', subject, message);
    return;
  }

  const payload = {
    sender: {
      email: process.env.BREVO_SENDER_EMAIL,
      name: process.env.BREVO_SENDER_NAME || 'Delivery Tracker'
    },
    to: [{ email: to }],
    subject,
    textContent: message,
    htmlContent: `<p>${message}</p>`
  };

  try {
    const res = await fetch(BREVO_EMAIL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Brevo email failed:', res.status, errBody);
    }
  } catch (err) {
    console.error('Brevo email error:', err.message);
  }
};

// Sends an SMS via Brevo. `to` should be a phone number in international
// format, e.g. +919876543210. If the number has no country code, IN (+91)
// is assumed as a sane default for this project — adjust if needed.
const sendStatusSms = async ({ to, message }) => {
  if (!smsConfigured() || !to) {
    console.log('SMS notification skipped:', message);
    return;
  }

  const recipient = to.startsWith('+') ? to : `+91${to.replace(/\D/g, '')}`;

  const payload = {
    sender: process.env.BREVO_SMS_SENDER, // max 11 alphanumeric chars, no spaces
    recipient,
    content: message,
    type: 'transactional'
  };

  try {
    const res = await fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Brevo SMS failed:', res.status, errBody);
    }
  } catch (err) {
    console.error('Brevo SMS error:', err.message);
  }
};

// Convenience helper: fires both email and SMS in parallel, and never
// throws — a notification failure should never break an order/status flow.
const notifyCustomer = async ({ email, phone, subject, message }) => {
  await Promise.all([
    sendStatusEmail({ to: email, subject, message }),
    phone ? sendStatusSms({ to: phone, message: `${subject}: ${message}` }) : Promise.resolve()
  ]);
};

module.exports = { sendStatusEmail, sendStatusSms, notifyCustomer };