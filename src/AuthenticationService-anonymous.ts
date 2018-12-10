export default () => {
    const loginResult = Promise.resolve();
    return {
        waitForLoginRequestComplete: loginResult
    };
};