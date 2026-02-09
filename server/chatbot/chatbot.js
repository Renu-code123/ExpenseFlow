const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "./chatbot/chatbot.css";
document.head.appendChild(link);

import { chatbotKnowledge } from "./chatbot.data.js";
import { CHATBOT_CONFIG } from "./chatbot.config.js";

fetch("./chatbot/chatbot.html")
  .then((res) => res.text())
  .then((html) => {
    document.body.insertAdjacentHTML("beforeend", html);

    const toggleBtn = document.getElementById("chatbot-toggle");
    const closeBtn = document.getElementById("chatbot-close");
    const windowEl = document.getElementById("chatbot-window");
    const messagesEl = document.getElementById("chatbot-messages");
    const inputEl = document.getElementById("chatbot-input");
    const sendBtn = document.getElementById("chatbot-send");

    toggleBtn.onclick = () => {
      windowEl.style.display =
        windowEl.style.display === "none" ? "flex" : "none";
    };

    closeBtn.onclick = () => {
      windowEl.style.display = "none";
    };

    const addMessage = (text, type = "bot") => {
      const msg = document.createElement("div");
      msg.textContent = text;
      msg.style.marginBottom = "8px";
      msg.style.textAlign = type === "user" ? "right" : "left";
      messagesEl.appendChild(msg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    if (CHATBOT_CONFIG.welcomeMessage) {
      addMessage(
        chatbotKnowledge.greetings[
          Math.floor(Math.random() * chatbotKnowledge.greetings.length)
        ],
      );
    }

    const getResponse = (message) => {
      const msg = message.toLowerCase();

      if (msg.includes("tip"))
        return chatbotKnowledge.tips[
          Math.floor(Math.random() * chatbotKnowledge.tips.length)
        ];
      if (msg.includes("budget")) return chatbotKnowledge.budget.setup;
      if (msg.includes("analytics")) return chatbotKnowledge.budget.analytics;
      if (msg.includes("export")) return chatbotKnowledge.navigation.export;
      if (msg.includes("notification"))
        return chatbotKnowledge.navigation.notifications;
      if (msg.includes("dashboard"))
        return chatbotKnowledge.navigation.dashboard;

      return "I can help with tips, budgets, analytics, exports, and navigation 🙂";
    };

    sendBtn.onclick = () => {
      const text = inputEl.value.trim();
      if (!text) return;

      addMessage(text, "user");
      inputEl.value = "";

      setTimeout(() => {
        addMessage(getResponse(text));
      }, 400);
    };
  });
