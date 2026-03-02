import emailjs from "@emailjs/browser";

const sendWelcomeMessage = (email) => {
  emailjs
    .send(
      import.meta.env.VITE_EMAILJS_SERVICE_ID,
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      {
        email: email,
      },
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    )
    .then((response) => {
      console.log("SUCCESS!", response.status, response.text);
    })
    .catch((err) => {
      console.log("FAILED...", err);
    });
};

export default sendWelcomeMessage;
