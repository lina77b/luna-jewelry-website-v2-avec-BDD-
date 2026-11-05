document.addEventListener('DOMContentLoaded', () => {
    const sliderWrapper = document.querySelector('.slider-wrapper');
    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.querySelector('.gauche-btn');
    const nextBtn = document.querySelector('.droite-btn');

    if (sliderWrapper && slides.length > 0 && prevBtn && nextBtn) {
        let currentSlide = 0;
        const totalSlides = slides.length;

        function goToSlide(index) {
            if (index >= totalSlides) {
                currentSlide = 0;
            } else if (index < 0) {
                currentSlide = totalSlides - 1;
            } else {
                currentSlide = index;
            }
            const translateValue = -currentSlide * (100 / totalSlides) + '%';
            sliderWrapper.style.transform = 'translateX(' + translateValue + ')';
        }

        prevBtn.addEventListener('click', () => {
            goToSlide(currentSlide - 1);
        });

        nextBtn.addEventListener('click', () => {
            goToSlide(currentSlide + 1);
        });

        let slideInterval = setInterval(() => {
            goToSlide(currentSlide + 1);
        }, 4000);

        sliderWrapper.addEventListener('mouseenter', () => {
            clearInterval(slideInterval);
        });

        sliderWrapper.addEventListener('mouseleave', () => {
            slideInterval = setInterval(() => {
                goToSlide(currentSlide + 1);
            }, 4000);
        });
    }

    document.addEventListener('click', (event) => {
        const navMenu = document.querySelector('.nav-menu');
        const hamburger = document.querySelector('.hamburger');
        if (!navMenu || !hamburger) return;

        if (event.target.closest('.nav-toggle')) {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
            return;
        }

        const dropdownLink = event.target.closest('.dropdown > .nav-link');
        if (dropdownLink) {
            const mobile = window.innerWidth <= 768;
            if (mobile || dropdownLink.getAttribute('href') === '#') {
                event.preventDefault();
            }
            if (mobile) {
                dropdownLink.parentElement.classList.toggle('active');
            }
            return;
        }

        if (!navMenu.contains(event.target)) {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            const navMenu = document.querySelector('.nav-menu');
            const hamburger = document.querySelector('.hamburger');
            if (navMenu) navMenu.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
            document.querySelectorAll('.dropdown').forEach((dropdown) => dropdown.classList.remove('active'));
        }
    });
});
