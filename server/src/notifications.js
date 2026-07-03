const nodemailer = require('nodemailer');

const transporter = process.env.EMAIL_HOST && process.env.EMAIL_USER
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  : null;

const sendStatusEmail = async ({ to, subject, message }) => {
  if (!transporter || !to) {
    console.log('Notification skipped:', subject, message);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text: message,
    html: `<p>${message}</p>`
  });
};

module.exports = { sendStatusEmail };
