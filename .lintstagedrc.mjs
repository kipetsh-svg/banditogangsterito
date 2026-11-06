export default {
    '*.js|*.mjs|*.cjs': ['eslint --fix', 'prettier --write --ignore-unknown'],
    '!(*.js|*.mjs|*.cjs)': ['prettier --write --ignore-unknown'],
};
