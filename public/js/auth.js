// public/js/auth.js
document.addEventListener('DOMContentLoaded', function() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    
    if (!loggedInUser && window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
        return;
    }

    const userDisplay = document.getElementById('user-display-name');
    if (userDisplay) {
        userDisplay.textContent = loggedInUser;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('loggedInUser');
            window.location.href = '/login.html';
        });
    }

    // --- NOVA LÓGICA PARA O MENU HAMBURGER ---
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Lógica para marcar o link ativo
    const currentPage = window.location.pathname;
    const navLinksList = document.querySelectorAll('.main-nav .nav-links a');
    navLinksList.forEach(link => {
        if (link.getAttribute('href') === currentPage || link.getAttribute('href') === currentPage.substring(1)) {
            link.classList.add('active');
        }
    });
});