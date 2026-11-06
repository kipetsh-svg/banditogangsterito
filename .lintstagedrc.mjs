export default {
    '*.js|*.mjs|*.cjs': ['eslint --fix', 'prettier --write --ignore-unknown --ignore-path /dev/null'],
    '!(*.js|*.mjs|*.cjs)': ['prettier --write --ignore-unknown --ignore-path /dev/null'],
};
