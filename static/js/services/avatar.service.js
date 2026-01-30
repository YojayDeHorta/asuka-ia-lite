
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// State
let scene, camera, renderer, clock;
let currentVrm = null;

// Config Defaults
let avatarConfig = {
    x: 0.0,
    y: 0.2,
    zoom: 1.4
};



// Init Scene
export async function initAvatar() {
    const container = document.getElementById("canvas-container");
    if (!container) return;

    // Load Config
    loadConfig();

    // Check if already inited
    if (renderer) return;

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent Background
    container.appendChild(renderer.domElement);

    // Camera
    camera = new THREE.PerspectiveCamera(30.0, container.clientWidth / container.clientHeight, 0.1, 20.0);
    // Initial camera pos (Z is controlled by zoom config usually, or we move camera)
    camera.position.set(0.0, 1.4, avatarConfig.zoom);

    // Scene
    scene = new THREE.Scene();

    // Lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-1.0, 1.0, -1.0).normalize();
    scene.add(backLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Clock
    clock = new THREE.Clock();

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
        vrm.scene.rotation.y = Math.PI;

        // Apply Config Position
        vrm.scene.position.set(avatarConfig.x, avatarConfig.y, 0);

        // Set Neutral Pose (Arms Down)
        if (vrm.humanoid) {
            const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            if (leftArm) leftArm.rotation.z = 1.2;
            if (rightArm) rightArm.rotation.z = -1.2;
        }

        console.log("VRM Loaded");
        if (loadingEl) loadingEl.style.display = "none";

    } catch (e) {
        console.error("Failed to load VRM", e);
        if (loadingEl) loadingEl.innerHTML = "<p style='color:red; background:rgba(0,0,0,0.5); padding:10px; border-radius:10px;'>Falta el modelo VRM (assets/asuka.vrm)</p>";
    }
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (currentVrm) {
        currentVrm.update(deltaTime);

        // Blink
        const s = Math.sin(clock.elapsedTime * 0.5);
        if (s > 0.99) {
            currentVrm.expressionManager.setValue('blink', 1.0);
        } else {
            currentVrm.expressionManager.setValue('blink', 0.0);
        }

        // Breathing (Vertical sway based on config Y)
        const breath = Math.sin(clock.elapsedTime);
        const baseY = avatarConfig.y;
        currentVrm.scene.position.y = baseY + (breath * 0.005);
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

    if (!xInput) return; // UI not ready

    // Set Initial UI Values
    xInput.value = avatarConfig.x;
    yInput.value = avatarConfig.y;
    zoomInput.value = avatarConfig.zoom;

    // Listeners
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
}


// Exported for button
window.saveAvatarConfig = () => {
    localStorage.setItem('asuka_avatar_config', JSON.stringify(avatarConfig));
    // Check if toast helper exists
    if (window.showToast) window.showToast("Configuración del modelo guardada", "success");
    else alert("Configuración Guardada");
};

// Lip Sync
export function updateLipSync(volume) {
    if (currentVrm) {
        const open = Math.min(1.0, volume * 5.0);
        currentVrm.expressionManager.setValue('aa', open);
    }
}
