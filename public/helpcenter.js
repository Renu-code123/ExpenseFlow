
(function() {
  // Hide default cursor
  document.body.style.cursor = 'none';

  const container = document.getElementById('cursor-trail');
  const coords = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const trailCircles = [];
  const COUNT = 12; // Fewer circles for smoother trail

  // Create trail circles
  for (let i = 0; i < COUNT; i++) {
    const circle = document.createElement('div');
    circle.className = 'trail-dot';

    // Opacity decreases along the trail
    const opacity = 0.9 - (i / COUNT) * 0.8;
    circle.style.opacity = opacity.toString();

    // Size decreases along the trail
    const scale = 1 - (i / COUNT) * 0.5;
    circle.style.transform = `translate(-50%, -50%) scale(${scale})`;

    container.appendChild(circle);
    trailCircles.push({ 
      element: circle, 
      x: coords.x, 
      y: coords.y,
      targetX: coords.x,
      targetY: coords.y
    });
  }

  // Track mouse position
  let isMoving = false;
  let lastMouseX = coords.x;
  let lastMouseY = coords.y;
  let velocity = { x: 0, y: 0 };

  window.addEventListener('mousemove', e => {
    coords.x = e.clientX;
    coords.y = e.clientY;

    // Calculate velocity for smooth movement
    velocity.x = e.clientX - lastMouseX;
    velocity.y = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    isMoving = true;

    // Reset movement timeout
    clearTimeout(window.movementTimeout);
    window.movementTimeout = setTimeout(() => {
      isMoving = false;
    }, 50);
  });

  // Click effect
  window.addEventListener('mousedown', () => {
    trailCircles.forEach(circle => {
      circle.element.classList.add('cursor-clicking');
    });
  });

  window.addEventListener('mouseup', () => {
    trailCircles.forEach(circle => {
      circle.element.classList.remove('cursor-clicking');
    });
  });

  // Hover effect for interactive elements
  window.addEventListener('mouseover', e => {
    const interactive = e.target.closest('a, button, input, select, textarea, [role="button"]');
    trailCircles.forEach(circle => {
      circle.element.classList.toggle('cursor-hovering', !!interactive);
    });
  });

  // Smooth animation function
  function animateTrail() {
    let targetX = coords.x;
    let targetY = coords.y;

    // Add velocity offset to first circle for more natural feel
    const velocityOffset = 0.5;
    const offsetX = velocity.x * velocityOffset;
    const offsetY = velocity.y * velocityOffset;

    trailCircles.forEach((circle, index) => {
      // First circle follows cursor exactly
      if (index === 0) {
        circle.x = targetX + offsetX;
        circle.y = targetY + offsetY;
      } 
      // Other circles follow with smooth delay
      else {
        const prevCircle = trailCircles[index - 1];

        // Smooth interpolation factor (changes based on movement speed)
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const lerpFactor = isMoving ? 
          Math.min(0.3 + (speed * 0.01), 0.5) :  // Faster movement = tighter trail
          0.1; // Slow movement = more spread

        circle.x += (prevCircle.x - circle.x) * lerpFactor;
        circle.y += (prevCircle.y - circle.y) * lerpFactor;
      }

      // Apply position with easing
      circle.element.style.left = circle.x + 'px';
      circle.element.style.top = circle.y + 'px';

      // Dynamic opacity based on speed and position
      if (index > 0) {
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const baseOpacity = 0.9 - (index / COUNT) * 0.8;
        const speedMultiplier = Math.min(1 + speed * 0.02, 1.5);
        circle.element.style.opacity = (baseOpacity * speedMultiplier).toString();
      }

      // Update target for next circle
      targetX = circle.x;
      targetY = circle.y;
    });

    requestAnimationFrame(animateTrail);
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    // Adjust if cursor goes out of bounds
    if (coords.x > window.innerWidth) coords.x = window.innerWidth;
    if (coords.y > window.innerHeight) coords.y = window.innerHeight;
  });

  // Handle mouse leave/enter
  window.addEventListener('mouseleave', () => {
    trailCircles.forEach(circle => {
      circle.element.style.opacity = '0';
    });
  });

  window.addEventListener('mouseenter', () => {
    trailCircles.forEach((circle, index) => {
      const opacity = 0.9 - (index / COUNT) * 0.8;
      circle.element.style.opacity = opacity.toString();
    });
  });

  // Start animation
  animateTrail();
})();



const translations = {
  en: {
    title: "Help Center",
    subtitle: "Find answers to common questions and learn how to use ExpenseFlow effectively",
    cards: [
      ["Getting Started","Create your account and start tracking expenses."],
      ["Adding Expenses","Add daily expenses for accurate tracking."],
      ["Understanding Analytics","View spending patterns and summaries."],
      ["Data & Privacy","Your data is safe and never shared."],
      ["Settings & Customization","Manage preferences and categories."]
    ],
    supportTitle: "Need More Help?",
    supportItems: [
      "✔ Check FAQs for common issues",
      "✔ Review Finance Tips for money guidance",
      "✔ Contact support for technical assistance"
    ]
  },

  hi: {
    title: "सहायता केंद्र",
    subtitle: "ExpenseFlow को सही तरीके से उपयोग करने में सहायता",
    cards: [
      ["शुरुआत करें","खाता बनाएं और खर्च ट्रैक करें।"],
      ["खर्च जोड़ना","रोज़ खर्च जोड़ें।"],
      ["एनालिटिक्स","खर्च पैटर्न देखें।"],
      ["डेटा सुरक्षा","आपका डेटा सुरक्षित है।"],
      ["सेटिंग्स","प्राथमिकताएँ बदलें।"]
    ],
    supportTitle: "और सहायता चाहिए?",
    supportItems: [
      "✔ सामान्य समस्याओं के लिए FAQ देखें",
      "✔ वित्तीय मार्गदर्शन के लिए टिप्स पढ़ें",
      "✔ तकनीकी सहायता के लिए सपोर्ट से संपर्क करें"
    ]
  },

  ta: {
    title: "உதவி மையம்",
    subtitle: "ExpenseFlow பயன்படுத்த வழிகாட்டி",
    cards: [
      ["தொடங்குதல்","செலவுகளை கண்காணிக்க தொடங்குங்கள்."],
      ["செலவுகள்","தினசரி செலவுகளை சேர்க்கவும்."],
      ["பகுப்பாய்வு","செலவு பழக்கங்களை பாருங்கள்."],
      ["பாதுகாப்பு","உங்கள் தரவு பாதுகாப்பானது."],
      ["அமைப்புகள்","விருப்பங்களை மாற்றவும்."]
    ],
    supportTitle: "மேலும் உதவி வேண்டுமா?",
    supportItems: [
      "✔ பொதுவான பிரச்சனைகளுக்கான FAQ",
      "✔ பண ஆலோசனைக்கான நிதி குறிப்புகள்",
      "✔ தொழில்நுட்ப உதவிக்காக தொடர்புகொள்ளவும்"
    ]
  },

  te: {
    title: "సహాయ కేంద్రం",
    subtitle: "ExpenseFlow వినియోగానికి మార్గదర్శకం",
    cards: [
      ["ప్రారంభం","ఖర్చులను ట్రాక్ చేయండి."],
      ["ఖర్చులు","రోజూ ఖర్చులు నమోదు చేయండి."],
      ["విశ్లేషణ","ఖర్చు సరళి చూడండి."],
      ["భద్రత","మీ డేటా సురక్షితం."],
      ["సెట్టింగ్స్","అభిరుచులు మార్చండి."]
    ],
    supportTitle: "ఇంకా సహాయం కావాలా?",
    supportItems: [
      "✔ సాధారణ సమస్యల కోసం FAQలు",
      "✔ ఆర్థిక సూచనలు చూడండి",
      "✔ సాంకేతిక సహాయం కోసం సంప్రదించండి"
    ]
  },

  bn: {
    title: "সহায়তা কেন্দ্র",
    subtitle: "ExpenseFlow ব্যবহারের সম্পূর্ণ নির্দেশিকা",
    cards: [
      ["শুরু করুন","অ্যাকাউন্ট তৈরি করে খরচ ট্র্যাক করুন।"],
      ["খরচ যোগ","প্রতিদিনের খরচ যুক্ত করুন।"],
      ["বিশ্লেষণ","ব্যয়ের ধরণ দেখুন।"],
      ["ডেটা সুরক্ষা","আপনার ডেটা নিরাপদ।"],
      ["সেটিংস","পছন্দ পরিবর্তন করুন।"]
    ],
    supportTitle: "আরও সাহায্য দরকার?",
    supportItems: [
      "✔ সাধারণ সমস্যার জন্য FAQ দেখুন",
      "✔ অর্থ সংক্রান্ত টিপস পড়ুন",
      "✔ প্রযুক্তিগত সহায়তার জন্য যোগাযোগ করুন"
    ]
  },

  mr: {
    title: "मदत केंद्र",
    subtitle: "ExpenseFlow योग्य प्रकारे वापरण्यासाठी मार्गदर्शक",
    cards: [
      ["सुरुवात","खाते तयार करा आणि खर्च नोंदवा."],
      ["खर्च जोडा","दररोज खर्च जोडा."],
      ["विश्लेषण","खर्चाचे पॅटर्न पहा."],
      ["डेटा सुरक्षा","आपला डेटा सुरक्षित आहे."],
      ["सेटिंग्स","प्राधान्ये बदला."]
    ],
    supportTitle: "अधिक मदत हवी आहे?",
    supportItems: [
      "✔ सामान्य समस्यांसाठी FAQ पहा",
      "✔ आर्थिक टिप्स वाचा",
      "✔ तांत्रिक सहाय्यासाठी संपर्क करा"
    ]
  },

  kn: {
    title: "ಸಹಾಯ ಕೇಂದ್ರ",
    subtitle: "ExpenseFlow ಬಳಸುವ ಮಾರ್ಗದರ್ಶಿ",
    cards: [
      ["ಪ್ರಾರಂಭ","ಖಾತೆ ರಚಿಸಿ ವೆಚ್ಚಗಳನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಿ."],
      ["ವೆಚ್ಚ ಸೇರಿಸಿ","ದೈನಂದಿನ ವೆಚ್ಚಗಳನ್ನು ಸೇರಿಸಿ."],
      ["ವಿಶ್ಲೇಷಣೆ","ವೆಚ್ಚದ ಮಾದರಿಗಳನ್ನು ನೋಡಿ."],
      ["ಭದ್ರತೆ","ನಿಮ್ಮ ಡೇಟಾ ಸುರಕ್ಷಿತವಾಗಿದೆ."],
      ["ಸೆಟ್ಟಿಂಗ್‌ಗಳು","ಆಯ್ಕೆಗಳನ್ನು ಬದಲಾಯಿಸಿ."]
    ],
    supportTitle: "ಇನ್ನಷ್ಟು ಸಹಾಯ ಬೇಕೆ?",
    supportItems: [
      "✔ ಸಾಮಾನ್ಯ ಸಮಸ್ಯೆಗಳಿಗಾಗಿ FAQ",
      "✔ ಹಣಕಾಸು ಸಲಹೆಗಳು",
      "✔ ತಾಂತ್ರಿಕ ಸಹಾಯಕ್ಕಾಗಿ ಸಂಪರ್ಕಿಸಿ"
    ]
  },

  ml: {
    title: "സഹായ കേന്ദ്രം",
    subtitle: "ExpenseFlow ഉപയോഗിക്കാൻ മാർഗ്ഗനിർദ്ദേശം",
    cards: [
      ["ആരംഭിക്കുക","അക്കൗണ്ട് സൃഷ്ടിച്ച് ചെലവുകൾ ട്രാക്ക് ചെയ്യുക."],
      ["ചെലവുകൾ","ദൈനംദിന ചെലവുകൾ ചേർക്കുക."],
      ["വിശകലനം","ചെലവ് രീതികൾ കാണുക."],
      ["സുരക്ഷ","നിങ്ങളുടെ ഡാറ്റ സുരക്ഷിതമാണ്."],
      ["സജ്ജീകരണങ്ങൾ","മുൻഗണനകൾ മാറ്റുക."]
    ],
    supportTitle: "കൂടുതൽ സഹായം വേണോ?",
    supportItems: [
      "✔ പൊതുവായ പ്രശ്നങ്ങൾക്ക് FAQ",
      "✔ സാമ്പത്തിക ടിപ്പുകൾ പരിശോധിക്കുക",
      "✔ സാങ്കേതിക സഹായത്തിനായി ബന്ധപ്പെടുക"
    ]
  },

  gu: {
    title: "મદદ કેન્દ્ર",
    subtitle: "ExpenseFlow ઉપયોગ માટે માર્ગદર્શન",
    cards: [
      ["શરૂઆત","ખાતું બનાવી ખર્ચ ટ્રેક કરો."],
      ["ખર્ચ ઉમેરો","દૈનિક ખર્ચ ઉમેરો."],
      ["વિશ્લેષણ","ખર્ચની રૂપરેખા જુઓ."],
      ["સુરક્ષા","તમારો ડેટા સુરક્ષિત છે."],
      ["સેટિંગ્સ","પસંદગીઓ બદલો."]
    ],
    supportTitle: "વધુ મદદ જોઈએ?",
    supportItems: [
      "✔ સામાન્ય સમસ્યાઓ માટે FAQ જુઓ",
      "✔ નાણાકીય ટીપ્સ વાંચો",
      "✔ ટેકનિકલ સહાય માટે સંપર્ક કરો"
    ]
  },

  pa: {
    title: "ਮਦਦ ਕੇਂਦਰ",
    subtitle: "ExpenseFlow ਵਰਤਣ ਲਈ ਮਾਰਗਦਰਸ਼ਨ",
    cards: [
      ["ਸ਼ੁਰੂ ਕਰੋ","ਅਕਾਊਂਟ ਬਣਾਓ ਅਤੇ ਖਰਚੇ ਟਰੈਕ ਕਰੋ।"],
      ["ਖਰਚੇ","ਰੋਜ਼ਾਨਾ ਖਰਚੇ ਜੋੜੋ।"],
      ["ਵਿਸ਼ਲੇਸ਼ਣ","ਖਰਚ ਪੈਟਰਨ ਵੇਖੋ।"],
      ["ਸੁਰੱਖਿਆ","ਤੁਹਾਡਾ ਡਾਟਾ ਸੁਰੱਖਿਅਤ ਹੈ।"],
      ["ਸੈਟਿੰਗਜ਼","ਪਸੰਦ ਬਦਲੋ।"]
    ],
    supportTitle: "ਹੋਰ ਮਦਦ ਚਾਹੀਦੀ ਹੈ?",
    supportItems: [
      "✔ ਆਮ ਸਮੱਸਿਆਵਾਂ ਲਈ FAQ",
      "✔ ਵਿੱਤੀ ਟਿੱਪਸ ਪੜ੍ਹੋ",
      "✔ ਤਕਨੀਕੀ ਸਹਾਇਤਾ ਲਈ ਸੰਪਰਕ ਕਰੋ"
    ]
  }
};

// Update content when language changes
document.getElementById("languageSelect").addEventListener("change", e => {
  const t = translations[e.target.value];

  // Update hero section
  document.querySelector(".hero-title").innerText = t.title;
  document.querySelector(".hero-subtitle").innerText = t.subtitle;

  // Update cards
  document.querySelectorAll(".balance-card").forEach((card, i) => {
    card.querySelector("h4").innerText = t.cards[i][0];
    card.querySelector("p").innerText = t.cards[i][1];
  });

  // Update support section
  const supportHeading = document.querySelector(".data-management-section h3");
  supportHeading.innerText = t.supportTitle;

  const supportListItems = document.querySelectorAll(".data-management-section ul li");
  supportListItems.forEach((li, idx) => {
    li.innerText = t.supportItems[idx];
  });
});
