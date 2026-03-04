let ratingValue = 0;
const stars = document.querySelectorAll(".rating span");

stars.forEach((star, i) => {
  star.onclick = () => {
    ratingValue = i + 1;
    stars.forEach((s) => s.classList.remove("active"));
    for (let j = 0; j <= i; j++) stars[j].classList.add("active");
  };
});

function submitFeedback(e) {
  e.preventDefault();

  if (ratingValue === 0) {
    Swal.fire({
      icon: "warning",
      title: "Rating Required",
      text: "Please select a star rating ⭐",
      confirmButtonColor: "#667eea",
    });
    return;
  }

  Swal.fire({
    icon: "success",
    title: "Thank You!",
    text: "Your feedback has been submitted successfully 💙",
    confirmButtonColor: "#667eea",
    background: getComputedStyle(document.body).getPropertyValue("--card-bg"),
    color: getComputedStyle(document.body).getPropertyValue("--text-primary"),
  });

  e.target.reset();
  stars.forEach((s) => s.classList.remove("active"));
  ratingValue = 0;
}

function toggleTheme() {
  document.body.classList.toggle("light");
}
