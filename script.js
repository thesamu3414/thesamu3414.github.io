(function () {
    var canvas = document.getElementById('sky'), ctx = canvas.getContext('2d');
    var btn = document.getElementById('toggle');
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        d.x = Math.min(d.x, W - R);
        if (state === 'landed') { d.y = H - FLOOR; draw(); }
    }
    window.addEventListener('resize', resize);

    // Drone state
    var d = { x: window.innerWidth * .7, y: window.innerHeight * .4, vx: 0, vy: 0, tilt: 0, spin: 0, av: 0 };
    var trail = [];
    var state = 'flying';      // flying | falling | landed | takeoff
    var power = 1;             // rotor power: 0 = stopped, 1 = full speed
    var G = 1500;              // gravity in px/s²
    var FLOOR = 21;            // distance from drone centre to the ground (skids + small margin)
    var keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
    var enabled = true;
    var ACCEL = 1100, DRAG = 2.2, MAXV = 520, R = 34;

    resize();

    window.addEventListener('keydown', function (e) {
        if (!enabled || !(e.key in keys)) return;
        keys[e.key] = true;
        e.preventDefault();               // stop the page from scrolling
    });
    window.addEventListener('keyup', function (e) { if (e.key in keys) keys[e.key] = false; });
    window.addEventListener('blur', function () { for (var k in keys) keys[k] = false; });

    var hint = document.querySelector('#hud span');
    function setDrone(on) {
        enabled = on;
        stick.classList.toggle('off', !on);
        hint.hidden = !on;
        btn.textContent = on ? 'Turn off drone' : 'Turn on drone';
        for (var k in keys) keys[k] = false;
        joy.x = 0; joy.y = 0; knob.style.transform = '';
        if (on) { state = 'takeoff'; }
        else { state = 'falling'; d.av = (d.vx / MAXV) * 3; }
        start();
    }
    btn.addEventListener('click', function () {
        dismissTip();
        setDrone(!enabled);
    });


    // Virtual joystick
    var stick = document.getElementById('stick'), knob = document.getElementById('knob');
    var joy = { x: 0, y: 0 }, joyId = null, STICK_R = 40;

    function moveKnob(e) {
        var r = stick.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        var len = Math.hypot(dx, dy);
        if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        joy.x = dx / STICK_R; joy.y = dy / STICK_R;      // values from -1 to 1
    }
    function releaseStick(e) {
        if (e.pointerId !== joyId) return;
        joyId = null; joy.x = 0; joy.y = 0; knob.style.transform = '';
    }
    stick.addEventListener('pointerdown', function (e) {
        dismissTip();
        if (!enabled) return;
        joyId = e.pointerId; stick.setPointerCapture(e.pointerId); moveKnob(e);
    });
    stick.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) moveKnob(e); });
    stick.addEventListener('pointerup', releaseStick);
    stick.addEventListener('pointercancel', releaseStick);

    // "Try me" hint: remove it the first time the person interacts
    var tip = document.getElementById('tryme');
    function dismissTip() {
        if (!tip) return;
        tip.classList.add('gone');
        var el = tip; tip = null;
        setTimeout(function () { el.remove(); }, 400);   // wait for fade-out
    }
    //setTimeout(dismissTip, 12000);                // fallback: hide after 12s

    function color(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

    function update(dt) {
        var sp = Math.hypot(d.vx, d.vy);

        if (state === 'flying') {
            var ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + joy.x;
            var ay = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0) + joy.y;
            ax = Math.max(-1, Math.min(1, ax));
            ay = Math.max(-1, Math.min(1, ay));
            d.vx += ax * ACCEL * dt; d.vy += ay * ACCEL * dt;
            d.vx -= d.vx * DRAG * dt; d.vy -= d.vy * DRAG * dt;
            sp = Math.hypot(d.vx, d.vy);
            if (sp > MAXV) { d.vx *= MAXV / sp; d.vy *= MAXV / sp; }
            d.x += d.vx * dt; d.y += d.vy * dt;
            if (d.x < R) { d.x = R; d.vx = Math.abs(d.vx) * .4; }
            if (d.x > W - R) { d.x = W - R; d.vx = -Math.abs(d.vx) * .4; }
            if (d.y < R) { d.y = R; d.vy = Math.abs(d.vy) * .4; }
            if (d.y > H - R) { d.y = H - R; d.vy = -Math.abs(d.vy) * .4; }
            var target = (d.vx / MAXV) * 0.45;
            d.tilt += (target - d.tilt) * Math.min(1, dt * 8);
            if (sp > 30) { trail.push({ x: d.x, y: d.y, a: 1 }); }
        }

        else if (state === 'falling') {
            power = Math.max(0, power - dt * 2.5);
            d.vy += G * dt;
            d.vx -= d.vx * .6 * dt;
            d.x += d.vx * dt; d.y += d.vy * dt;
            d.x = Math.max(R, Math.min(W - R, d.x));
            d.tilt += d.av * dt;
            var floor = H - FLOOR;
            if (d.y >= floor) {
                d.y = floor; d.av = 0; d.tilt *= .4;
                if (d.vy > 180) { d.vy = -d.vy * .35; d.vx *= .5; }
                else { d.vy = 0; d.vx = 0; d.tilt = 0; state = 'landed'; }
            }
        }

        else if (state === 'takeoff') {
            power = Math.min(1, power + dt * 1.2);
            d.tilt += (0 - d.tilt) * Math.min(1, dt * 8);
            d.vx -= d.vx * 3 * dt;
            if (power < .85) {
                d.vy -= d.vy * Math.min(1, dt * 6);        // stays put while spinning up
            } else {
                var hover = H * .45;                       // soft lift towards hover height
                d.vy += ((hover - d.y) * 6 - d.vy * 4.5) * dt;
                if (Math.abs(hover - d.y) < 10 && Math.abs(d.vy) < 40) { state = 'flying'; }
            }
            d.x += d.vx * dt; d.y += d.vy * dt;
        }

        d.spin += dt * (30 + sp * .05) * power;
        for (var i = trail.length - 1; i >= 0; i--) {
            trail[i].a -= dt * 1.2;
            if (trail[i].a <= 0) trail.splice(i, 1);
        }
    }


    function draw() {
        var ink = color('--ink'), rotor = color('--rotor'), sky = color('--sky'), led = color('--ledLight');
        ctx.clearRect(0, 0, W, H);

        // trail
        for (var i = 0; i < trail.length; i++) {
            ctx.globalAlpha = trail[i].a * .35; ctx.fillStyle = ink;
            ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, 3 * trail[i].a + 1, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ground shadow-like halo
        ctx.save();
        ctx.translate(d.x, d.y); ctx.rotate(d.tilt);

        // arms
        ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-R, -6); ctx.lineTo(R, -6); ctx.stroke();
        // rotor posts
        ctx.lineWidth = 3;
        [-R, R].forEach(
            function (px) {
                ctx.beginPath(); ctx.moveTo(px, -6);
                if (px < 0) { ctx.lineTo(px - 3, -14) } else { ctx.lineTo(px + 3, -14) };
                ctx.stroke();
            });

        // body
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.roundRect(-16, -10, 32, 18, 7); ctx.fill();
        // camera lens 1
        ctx.fillStyle = sky; ctx.beginPath(); ctx.arc(-6, 0, 4.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = rotor; ctx.beginPath(); ctx.arc(-6, 0, 2, 0, 6.283); ctx.fill();
        // camera lens 2
        ctx.fillStyle = sky; ctx.beginPath(); ctx.arc(6, 0, 4.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = rotor; ctx.beginPath(); ctx.arc(6, 0, 2, 0, 6.283); ctx.fill();

        // LED light
        var blinkOn = (performance.now() % 1200) < 150;
        if (blinkOn) {
            ctx.fillStyle = led;
            ctx.beginPath(); ctx.arc(0, 9, 7, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = blinkOn ? '#ff2a2a' : '#5a1414';
        ctx.beginPath(); ctx.arc(0, 9, 2.2, 0, 6.283); ctx.fill();


        // spinning rotors (flat ellipses that "blur" as they spin)
        [-R, R].forEach(function (px, idx) {
            var w = 22 * (0.55 + 0.45 * Math.abs(Math.cos(d.spin + idx)));
            ctx.fillStyle = rotor; ctx.globalAlpha = .9;
            ctx.beginPath();
            if (px < 0) { ctx.ellipse(px - 3, -16, w, 3.2, 0, 0, 6.283) }
            else { ctx.ellipse(px + 3, -16, w, 3.2, 0, 0, 6.283) }; ctx.fill();
        });
        ctx.globalAlpha = 1;

        // landing skids
        ctx.strokeStyle = ink; ctx.lineWidth = 3;
        //ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(-14, 17); ctx.lineTo(-4, 17);
        //ctx.moveTo(12, 8); ctx.lineTo(14, 17); ctx.lineTo(4, 17); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-12, 8); ctx.lineTo(-19, 14); ctx.lineTo(-19, 18);
        ctx.moveTo(12, 8); ctx.lineTo(19, 14); ctx.lineTo(19, 18); ctx.stroke();
        ctx.restore();
    }

    var raf = 0;
    var last = 0;
    function start() {
        if (raf) return;                              // never run two loops at once
        last = performance.now();
        raf = requestAnimationFrame(loop);
    }
    function loop(now) {
        raf = 0;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        update(dt); draw();
        if (state !== 'landed') raf = requestAnimationFrame(loop);   // idle once on the ground
    }
    start();
    if (reduce) { d.spin = 0; }
})();