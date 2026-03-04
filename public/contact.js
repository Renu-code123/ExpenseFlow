(function () {
    // Hide default cursor
    document.body.style.cursor = "none";

    const container = document.getElementById("cursor-trail");
    const coords = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const trailCircles = [];
    const COUNT = 12; // Fewer circles for smoother trail

    // Create trail circles
    for (let i = 0; i < COUNT; i++) {
        const circle = document.createElement("div");
        circle.className = "trail-dot";

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
            targetY: coords.y,
        });
    }

    // Track mouse position
    let isMoving = false;
    let lastMouseX = coords.x;
    let lastMouseY = coords.y;
    let velocity = { x: 0, y: 0 };

    window.addEventListener("mousemove", (e) => {
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
    window.addEventListener("mousedown", () => {
        trailCircles.forEach((circle) => {
            circle.element.classList.add("cursor-clicking");
        });
    });

    window.addEventListener("mouseup", () => {
        trailCircles.forEach((circle) => {
            circle.element.classList.remove("cursor-clicking");
        });
    });

    // Hover effect for interactive elements
    window.addEventListener("mouseover", (e) => {
        const interactive = e.target.closest(
            'a, button, input, select, textarea, [role="button"]',
        );
        trailCircles.forEach((circle) => {
            circle.element.classList.toggle("cursor-hovering", !!interactive);
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
                const speed = Math.sqrt(
                    velocity.x * velocity.x + velocity.y * velocity.y,
                );
                const lerpFactor = isMoving
                    ? Math.min(0.3 + speed * 0.01, 0.5) // Faster movement = tighter trail
                    : 0.1; // Slow movement = more spread

                circle.x += (prevCircle.x - circle.x) * lerpFactor;
                circle.y += (prevCircle.y - circle.y) * lerpFactor;
            }

            // Apply position with easing
            circle.element.style.left = circle.x + "px";
            circle.element.style.top = circle.y + "px";

            // Dynamic opacity based on speed and position
            if (index > 0) {
                const speed = Math.sqrt(
                    velocity.x * velocity.x + velocity.y * velocity.y,
                );
                const baseOpacity = 0.9 - (index / COUNT) * 0.8;
                const speedMultiplier = Math.min(1 + speed * 0.02, 1.5);
                circle.element.style.opacity = (
                    baseOpacity * speedMultiplier
                ).toString();
            }

            // Update target for next circle
            targetX = circle.x;
            targetY = circle.y;
        });

        requestAnimationFrame(animateTrail);
    }

    // Handle window resize
    window.addEventListener("resize", () => {
        // Adjust if cursor goes out of bounds
        if (coords.x > window.innerWidth) coords.x = window.innerWidth;
        if (coords.y > window.innerHeight) coords.y = window.innerHeight;
    });

    // Handle mouse leave/enter
    window.addEventListener("mouseleave", () => {
        trailCircles.forEach((circle) => {
            circle.element.style.opacity = "0";
        });
    });

    window.addEventListener("mouseenter", () => {
        trailCircles.forEach((circle, index) => {
            const opacity = 0.9 - (index / COUNT) * 0.8;
            circle.element.style.opacity = opacity.toString();
        });
    });

    // Start animation
    animateTrail();
})();

document.getElementById("contactForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById("submitBtn");
    const statusMsg = document.getElementById("statusMsg");
    const formData = {
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        subject: document.getElementById("subject").value,
        message: document.getElementById("message").value,
        userId: localStorage.getItem("userId"), // Optional if logged in
    };

    submitBtn.disabled = true;
    submitBtn.querySelector("span").textContent = "Sending...";
    statusMsg.className = "status-msg";
    statusMsg.textContent = "";

    try {
        const response = await fetch("/api/contact", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
        });

        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(
                text || `Server returned ${response.status} ${response.statusText}`,
            );
        }

        if (response.ok) {
            statusMsg.classList.add("success");
            statusMsg.textContent = data.message;
            document.getElementById("contactForm").reset();
        } else {
            throw new Error(data.error || data.message || "Something went wrong");
        }
    } catch (error) {
        statusMsg.classList.add("error");
        statusMsg.textContent = error.message;
        console.error("Submission error:", error);

        if (
            error.message.includes("Unexpected end of JSON input") ||
            error.message.includes("Fetch") ||
            error.message.includes("405")
        ) {
            statusMsg.textContent +=
                ' (Tip: Make sure you are using port 3000. Access the form via http://localhost:3000/contact.html and ensure "npm run dev" is running in your terminal)';
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = "Send Message";
    }
});
/* =========================
   DARK / LIGHT MODE LOGIC
========================= */

const toggleBtn = document.getElementById("themeToggle");
const body = document.body;
const icon = toggleBtn.querySelector("i");

// Load saved theme
if (localStorage.getItem("theme") === "light") {
    body.classList.add("light-mode");
    icon.classList.remove("fa-moon");
    icon.classList.add("fa-sun");
}

toggleBtn.addEventListener("click", () => {
    body.classList.toggle("light-mode");

    if (body.classList.contains("light-mode")) {
        localStorage.setItem("theme", "light");
        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");
    } else {
        localStorage.setItem("theme", "dark");
        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");
    }
});

