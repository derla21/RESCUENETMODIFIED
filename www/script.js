document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");
    const loginBtn = document.getElementById("loginBtn");
    const signupBtn = document.getElementById("signupBtn");

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const rememberInput = document.getElementById("remember");


    /*
    ============================================
    DEMO LOGIN INFORMATION
    ============================================
    */

    const correctEmail = "admin@rescuenet.com";
    const correctPassword = "12345678";


    /*
    ============================================
    LOGIN BUTTON
    ============================================
    */

    loginBtn.addEventListener("click", function () {

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();


        /*
        CHECK EMPTY FIELDS
        */

        if (email === "") {

            alert("Please enter your email address.");

            emailInput.focus();

            return;
        }


        if (password === "") {

            alert("Please enter your password.");

            passwordInput.focus();

            return;
        }


        /*
        CHECK LOGIN INFORMATION
        */

        if (
            email === correctEmail &&
            password === correctPassword
        ) {

            /*
            SAVE LOGIN STATUS
            */

            sessionStorage.setItem(
                "rescueNetLoggedIn",
                "true"
            );


            sessionStorage.setItem(
                "rescueNetUserEmail",
                email
            );


            /*
            REMEMBER ME
            */

            if (rememberInput.checked) {

                localStorage.setItem(
                    "rescueNetRemember",
                    "true"
                );

                localStorage.setItem(
                    "rescueNetEmail",
                    email
                );

            } else {

                localStorage.removeItem(
                    "rescueNetRemember"
                );

                localStorage.removeItem(
                    "rescueNetEmail"
                );

            }


            /*
            SUCCESS
            */

            alert(
                "Login successful! Welcome to RescueNet."
            );


            /*
            GO TO DASHBOARD
            */

            window.location.href =
                "dashboard.html";

        } else {

            alert(
                "Incorrect email or password. Please try again."
            );

            passwordInput.value = "";

            passwordInput.focus();

        }

    });


    /*
    ============================================
    ENTER KEY LOGIN
    ============================================
    */

    loginForm.addEventListener("submit", function (event) {

        event.preventDefault();

        loginBtn.click();

    });


    /*
    ============================================
    SIGN UP BUTTON
    ============================================
    */

    signupBtn.addEventListener("click", function () {

        window.location.href =
            "register.html";

    });


    /*
    ============================================
    REMEMBERED EMAIL
    ============================================
    */

    const rememberedEmail =
        localStorage.getItem("rescueNetEmail");


    const rememberStatus =
        localStorage.getItem("rescueNetRemember");


    if (
        rememberedEmail &&
        rememberStatus === "true"
    ) {

        emailInput.value =
            rememberedEmail;

        rememberInput.checked =
            true;

    }


    /*
    ============================================
    FORGOT PASSWORD
    ============================================
    */

    const forgotLink =
        document.querySelector(".forgot-link");


    if (forgotLink) {

        forgotLink.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                alert(
                    "Password recovery will be available soon."
                );

            }
        );

    }


    /*
    ============================================
    VIEW MORE
    ============================================
    */

    const viewMoreBtn =
        document.getElementById("viewMoreBtn");


    if (viewMoreBtn) {

        viewMoreBtn.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                alert(
                    "RescueNet is an emergency response platform designed to connect communities with responders."
                );

            }
        );

    }

});