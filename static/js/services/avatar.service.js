
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import TWEEN from '@tweenjs/tween.js';

// State
let scene, camera, renderer, clock;
let currentVrm = null;
let currentLipValue = 0;
let targetLipValue = 0;
const lipSmoothSpeed = 20;

// Physics / Animation State
const mouse = { x: 0, y: 0 };
const targetLook = { x: 0, y: 0 };
const saccadeTarget = { x: 0, y: 0 };
let saccadeTimer = 0;
let nextBlinkTime = 0;

// Config Defaults
let avatarConfig = {
    x: 0.0,
    y: 0.2,
    zoom: 1.4,
    rotY: 3.14,
    armL: 1.2,
    armR: -1.2
};

// Init Scene
export async function initAvatar() {
    const container = document.getElementById("canvas-container");
    if (!container) return;

    // Load Config
    loadConfig();

    // Check if already inited
    if (renderer) return;

    // Initialize Particles (safely)
    if (window.particlesJS) {
        window.particlesJS("particles-js", {
            "particles": { "number": { "value": 40 }, "opacity": { "value": 0.2 }, "size": { "value": 3 }, "move": { "enable": true, "speed": 1 } }
        });
    }

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent
    renderer.outputColorSpace = 'srgb';
    container.appendChild(renderer.domElement);

    // Camera
    camera = new THREE.PerspectiveCamera(30.0, container.clientWidth / container.clientHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.4, avatarConfig.zoom);

    // Scene
    scene = new THREE.Scene();

    // Lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Soft Key
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3); // Rim
    backLight.position.set(-1.0, 1.0, -1.0).normalize();
    scene.add(backLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Fill
    scene.add(ambientLight);

    // Clock
    clock = new THREE.Clock();

    // Mouse Listener
    document.addEventListener('mousemove', (e) => {
        // Map to -1 to 1 based on window size
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // Load VRM
    await loadVRM('assets/asuka.vrm');

    // Controls Setup
    setupControls();

    // Resize Event
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    // Start Loop
    animate();
}

function handleResize() {
    const container = document.getElementById("canvas-container");
    if (container && camera && renderer) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

async function loadVRM(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => {
        return new VRMLoaderPlugin(parser);
    });

    const loadingEl = document.getElementById("avatar-loading");
    if (loadingEl) loadingEl.style.display = "block";

    try {
        const gltf = await loader.loadAsync(url);
        const vrm = gltf.userData.vrm;

        if (currentVrm) {
            scene.remove(currentVrm.scene);
            VRMUtils.deepDispose(currentVrm.scene);
        }

        currentVrm = vrm;
        scene.add(vrm.scene);

        // Setup Orientation
        VRMUtils.rotateVRM0(vrm);

        // Initial Pose
        applyPose();

        // Intro Animation
        vrm.scene.rotation.y = avatarConfig.rotY + 1;
        new TWEEN.Tween(vrm.scene.rotation)
            .to({ y: avatarConfig.rotY }, 1000)
            .easing(TWEEN.Easing.Cubic.Out)
            .start();

        // Apply Config Position
        vrm.scene.position.set(avatarConfig.x, avatarConfig.y, 0);

        console.log("VRM Loaded (Advanced Mode)");
        if (loadingEl) loadingEl.style.display = "none";

    } catch (e) {
        console.error("Failed to load VRM", e);
        if (loadingEl) loadingEl.innerHTML = "<p style='color:red; background:rgba(0,0,0,0.5); padding:10px; border-radius:10px;'>Falta el modelo VRM (assets/asuka.vrm)</p>";
    }
}

function applyPose() {
    if (!currentVrm) return;

    // Base Rotation
    currentVrm.scene.rotation.y = avatarConfig.rotY;

    // Arms
    if (currentVrm.humanoid) {
        const leftArm = currentVrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightArm = currentVrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        if (leftArm) leftArm.rotation.z = avatarConfig.armL;
        if (rightArm) rightArm.rotation.z = avatarConfig.armR;
    }
}

// Main Animation Loop
function animate() {
    requestAnimationFrame(animate);

    TWEEN.update();
    const delta = clock.getDelta();
    const time = clock.elapsedTime;

    if (currentVrm && currentVrm.humanoid) {

        // 1. LOOK AT (Mouse + Saccades)
        if (time > saccadeTimer) {
            saccadeTarget.x = (Math.random() - 0.5) * 0.3; // Random variance X
            saccadeTarget.y = (Math.random() - 0.5) * 0.1; // Random variance Y
            saccadeTimer = time + 2 + Math.random() * 3; // New target every 2-5s
        }

        // Blend mouse with saccade
        const finalTargetX = (mouse.x * 0.7) + saccadeTarget.x;
        const finalTargetY = (mouse.y * 0.7) + saccadeTarget.y;

        // Smooth interpolation
        targetLook.x += (finalTargetX - targetLook.x) * 5 * delta;
        targetLook.y += (finalTargetY - targetLook.y) * 5 * delta;

        // Apply to bones
        const neck = currentVrm.humanoid.getNormalizedBoneNode('neck');
        const head = currentVrm.humanoid.getNormalizedBoneNode('head');
        const spine = currentVrm.humanoid.getNormalizedBoneNode('spine');

        if (neck) { neck.rotation.y = targetLook.x * 0.4; neck.rotation.x = targetLook.y * 0.3; }
        if (head) { head.rotation.y = targetLook.x * 0.2; head.rotation.x = targetLook.y * 0.2; }
        if (spine) { spine.rotation.y = targetLook.x * 0.1; }

        // 2. BREATHING (Natural Sway)
        const breath = Math.sin(time * 1.5);
        const chest = currentVrm.humanoid.getNormalizedBoneNode('chest');
        if (chest) chest.rotation.x = breath * 0.03;

        ['leftShoulder', 'rightShoulder'].forEach(s => {
            const n = currentVrm.humanoid.getNormalizedBoneNode(s);
            if (n) n.rotation.z = breath * 0.02 * (s.includes('right') ? -1 : 1);
        });

        // 3. LIP SYNC (Smoothed)
        // Lerp towards target
        currentLipValue += (targetLipValue - currentLipValue) * lipSmoothSpeed * delta;

        // Apply to morphs (A, I, U, E, O)
        currentVrm.expressionManager.setValue('aa', currentLipValue * 0.8);
        currentVrm.expressionManager.setValue('ih', currentLipValue * 0.4);
        currentVrm.expressionManager.setValue('ou', currentLipValue * 0.3);

        // 4. BLINK (Random)
        if (time > nextBlinkTime) {
            new TWEEN.Tween({ v: 0 })
                .to({ v: 1 }, 50)
                .onUpdate(o => currentVrm.expressionManager.setValue('blink', o.v))
                .chain(
                    new TWEEN.Tween({ v: 1 })
                        .to({ v: 0 }, 100)
                        .onUpdate(o => currentVrm.expressionManager.setValue('blink', o.v))
                )
                .start();
            nextBlinkTime = time + Math.random() * 4 + 1;
        }

        currentVrm.update(delta);
    }

    renderer.render(scene, camera);
}


// Config & Controls
function loadConfig() {
    const saved = localStorage.getItem('asuka_avatar_config');
    if (saved) {
        try {
            avatarConfig = { ...avatarConfig, ...JSON.parse(saved) };
        } catch (e) { console.error("Bad config", e); }
    }
}

function setupControls() {
    const xInput = document.getElementById('av-pos-x');
    const yInput = document.getElementById('av-pos-y');
    const zoomInput = document.getElementById('av-zoom');

    const rotInput = document.getElementById('av-rot-y');
    const armLInput = document.getElementById('av-arm-l');
    const armRInput = document.getElementById('av-arm-r');

    if (!xInput) return;

    // Set Initial UI Values
    xInput.value = avatarConfig.x;
    yInput.value = avatarConfig.y;
    zoomInput.value = avatarConfig.zoom;
    if (rotInput) rotInput.value = avatarConfig.rotY;
    if (armLInput) armLInput.value = avatarConfig.armL;
    if (armRInput) armRInput.value = avatarConfig.armR;

    // Listeners
    xInput.addEventListener('input', (e) => {
        avatarConfig.x = parseFloat(e.target.value);
        if (currentVrm) currentVrm.scene.position.x = avatarConfig.x;
    });

    yInput.addEventListener('input', (e) => {
        avatarConfig.y = parseFloat(e.target.value);
        if (currentVrm) currentVrm.scene.position.y = avatarConfig.y;
    });

    zoomInput.addEventListener('input', (e) => {
        avatarConfig.zoom = parseFloat(e.target.value);
        if (camera) camera.position.z = avatarConfig.zoom;
    });

    if (rotInput) {
        rotInput.addEventListener('input', (e) => {
            avatarConfig.rotY = parseFloat(e.target.value);
            if (currentVrm) currentVrm.scene.rotation.y = avatarConfig.rotY;
        });
    }

    if (armLInput) {
        armLInput.addEventListener('input', (e) => {
            avatarConfig.armL = parseFloat(e.target.value);
            applyPose(); // Re-apply to update bones
        });
    }

    if (armRInput) {
        armRInput.addEventListener('input', (e) => {
            avatarConfig.armR = parseFloat(e.target.value);
            applyPose();
        });
    }
}

// Exported for button
window.saveAvatarConfig = () => {
    localStorage.setItem('asuka_avatar_config', JSON.stringify(avatarConfig));
    if (window.showToast) window.showToast("Configuración del modelo guardada", "success");
    else alert("Configuración Guardada");
};

// Lip Sync Receiver (Called from Voice Service or Animation Loop)
export function updateLipSync(targetValue) {
    if (currentVrm) {
        targetLipValue = targetValue;
    }
}
