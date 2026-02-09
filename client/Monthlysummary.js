
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

    /* ========= ELEMENT REFERENCES ========= */
    const incomeEl = document.getElementById("income");
    const expenseEl = document.getElementById("expense");
    const categoryEl = document.getElementById("category");
    const savingsEl = document.getElementById("savings");
    const report = document.getElementById("report");
    const reportTitle = document.getElementById("reportTitle");
    const summaryText = document.getElementById("summaryText");
    const typeSelect = document.getElementById("type");
    const periodSelect = document.getElementById("period");
    const chartCanvas = document.getElementById("summaryChart");

    let chartInstance = null;

    /* ========= DUMMY DATA ========= */
    const dummyExpenses = [
      {
        amount: 45000,
        type: "income",
        category: "Salary",
        date: "2026-01-05",
      },
      {
        amount: 12000,
        type: "expense",
        category: "Food",
        date: "2026-01-10",
      },
      { amount: 8000, type: "expense", category: "Rent", date: "2026-01-01" },
      {
        amount: 4000,
        type: "expense",
        category: "Travel",
        date: "2026-01-18",
      },
      {
        amount: 45000,
        type: "income",
        category: "Salary",
        date: "2026-02-05",
      },
      {
        amount: 10000,
        type: "expense",
        category: "Food",
        date: "2026-02-12",
      },
      { amount: 9000, type: "expense", category: "Rent", date: "2026-02-02" },
      {
        amount: 5000,
        type: "expense",
        category: "Shopping",
        date: "2026-02-20",
      },
    ];

    let expenses = JSON.parse(localStorage.getItem("expenses"));
    if (!expenses || !expenses.length) {
      expenses = dummyExpenses;
      localStorage.setItem("expenses", JSON.stringify(expenses));
    }

    /* ========= LOAD PERIODS ========= */
    function loadPeriods() {
      periodSelect.innerHTML = "";
      const y = new Date().getFullYear();

      if (typeSelect.value === "month") {
        for (let m = 1; m <= 12; m++) {
          const opt = document.createElement("option");
          opt.value = `${y}-${m}`;
          opt.text = `${y} - ${new Date(y, m - 1).toLocaleString("default", { month: "long" })}`;
          periodSelect.appendChild(opt);
        }
      } else {
        for (let i = y - 2; i <= y + 1; i++) {
          const opt = document.createElement("option");
          opt.value = i;
          opt.text = i;
          periodSelect.appendChild(opt);
        }
      }
    }

    // {/* /* ========= GENERATE REPORT ========= */ */}
    function generateReport() {
      let income = 0,
        expense = 0,
        categories = {};

      expenses.forEach((e) => {
        const d = new Date(e.date);
        let match = false;

        if (typeSelect.value === "month") {
          match =
            `${d.getFullYear()}-${d.getMonth() + 1}` === periodSelect.value;
        } else {
          match = d.getFullYear() == periodSelect.value;
        }

        if (match) {
          if (e.type === "income") income += e.amount;
          else {
            expense += e.amount;
            categories[e.category] = (categories[e.category] || 0) + e.amount;
          }
        }
      });

      const topCategory = Object.keys(categories).length
        ? Object.keys(categories).sort(
          (a, b) => categories[b] - categories[a],
        )[0]
        : "-";

      const savingsPct = income
        ? (((income - expense) / income) * 100).toFixed(1)
        : 0;

      incomeEl.innerText = `₹${income.toLocaleString()}`;
      expenseEl.innerText = `₹${expense.toLocaleString()}`;
      categoryEl.innerText = topCategory;
      savingsEl.innerText = `${savingsPct}%`;

      reportTitle.innerText = `Report: ${periodSelect.options[periodSelect.selectedIndex].text}`;

      summaryText.innerHTML = income
        ? `You earned <b>₹${income.toLocaleString()}</b> and spent <b>₹${expense.toLocaleString()}</b>.
       Highest spending was on <b>${topCategory}</b>.
       Savings rate is <b>${savingsPct}%</b>.`
        : `No data available for the selected period.`;

      /* ========= CHART ========= */
      if (chartInstance) chartInstance.destroy();

      chartInstance = new Chart(chartCanvas, {
        type: "doughnut",
        data: {
          labels: Object.keys(categories),
          datasets: [
            {
              data: Object.values(categories),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: "#b4b4b4" },
            },
          },
        },
      });

      report.style.display = "block";
    }

    /* ========= DOWNLOAD IMAGE ========= */
    function downloadImage() {
      html2canvas(report).then((canvas) => {
        const link = document.createElement("a");
        link.download = "ExpenseFlow_Report.png";
        link.href = canvas.toDataURL();
        link.click();
      });
    }

    /* ========= DOWNLOAD PDF ========= */
    function downloadPDF() {
      html2canvas(report).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jspdf.jsPDF("p", "mm", "a4");
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 10, w, h);
        pdf.save("ExpenseFlow_Report.pdf");
      });
    }

    /* ========= INIT ========= */
    typeSelect.onchange = loadPeriods;
    loadPeriods();

