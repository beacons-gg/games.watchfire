// Stands in for react-devtools-core in the release bundle. Ink only uses devtools when DEV=true.
const devtools = { initialize() {}, connectToDevTools() {} };
export default devtools;
export const initialize = devtools.initialize;
export const connectToDevTools = devtools.connectToDevTools;
