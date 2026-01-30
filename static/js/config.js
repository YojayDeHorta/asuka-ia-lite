
export const API_URL = "/api";

let _uid = localStorage.getItem("asuka_web_uid");
if (!_uid) {
    _uid = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem("asuka_web_uid", _uid);
    console.log("New User ID Generated:", _uid);
} else {
    console.log("Welcome back, User:", _uid);
}

export const getUID = () => _uid;
export const setUID = (newUid) => {
    _uid = newUid;
    // Also update localStorage if needed, or just memory
    // In app.js it was "asuka_web_uid" for generated, and "asuka_auth_user" for login.
    // authenticatedFetch just uses the variable.
};
