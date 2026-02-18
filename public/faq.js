    const faqitems=document.querySelectorAll('.faq-item');
    faqitems.forEach((item)=>{
    setTimeout(()=>{
        item.addEventListener("click",()=>{
            item.classList.toggle("active");
            });
        },
        1000);
    })
