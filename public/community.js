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

/* THEME TOGGLE */
function toggleTheme() {
    document.body.classList.toggle("light");
    localStorage.setItem(
        "theme",
        document.body.classList.contains("light") ? "light" : "dark",
    );
}
if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light");
}

/* COMMUNITY LOGIC */
let posts = JSON.parse(localStorage.getItem("ef_posts")) || [];

function showSwal(msg) {
    document.getElementById("swal-msg").innerText = msg;
    document.getElementById("swal").classList.add("show");
}
function closeSwal() {
    document.getElementById("swal").classList.remove("show");
}
function save() {
    localStorage.setItem("ef_posts", JSON.stringify(posts));
}

function addPost() {
    if (!title.value.trim() || !content.value.trim()) {
        showSwal("⚠ Please fill all fields");
        return;
    }
    posts.unshift({
        id: Date.now(),
        title: title.value,
        content: content.value,
        up: 0,
        replies: [],
    });
    title.value = "";
    content.value = "";
    save();
    render();
    showSwal("✅ Post added");
}

function delPost(id) {
    posts = posts.filter((p) => p.id !== id);
    save();
    render();
    showSwal("🗑 Post deleted");
}

function upvote(id) {
    posts.find((p) => p.id === id).up++;
    save();
    render();
}

function reply(id) {
    const i = document.getElementById("r" + id);
    if (!i.value.trim()) {
        showSwal("⚠ Reply empty");
        return;
    }
    posts.find((p) => p.id === id).replies.push({ t: i.value, u: 0 });
    i.value = "";
    save();
    render();
    showSwal("💬 Reply added");
}

function render() {
    document.getElementById("posts").innerHTML = posts
        .map(
            (p) => `
<li>
<strong>${p.title}</strong>
<p>${p.content}</p>
<button class="filter-btn" onclick="upvote(${p.id})">👍 ${p.up}</button>
<button class="filter-btn" onclick="delPost(${p.id})">🗑</button>
<div class="reply-box">
<input id="r${p.id}" placeholder="Reply">
<button class="filter-btn" onclick="reply(${p.id})">Reply</button>
${p.replies.map((r) => `<div>💬 ${r.t}</div>`).join("")}
</div>
</li>`,
        )
        .join("");
}
render();
