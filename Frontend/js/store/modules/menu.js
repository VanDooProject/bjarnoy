
const state = {
    menuPos: {x:0, y:0},
    menuTile: {},
    menuVisible: false,
    menuClosed: false,
    menuBuildOpen: false,
}
const getters = {};
const actions = {};
const mutations = {
    SetMenuPos (state, pos) {
        //Removing any unused poperties
        state.menuPos.x = pos.x;
        state.menuPos.y = pos.y;
    },
    SetMenuTile (state, tile) {
        state.menuTile = tile;
    },
    SetMenuVisible (state, visible) {
        state.menuVisible = visible;
    },
    SetMenuClosed (state, closed)
    {
        state.menuClosed = closed;
        state.menuBuildOpen = false;
    },
    OpenBuildMenu (state) {
        state.menuBuildOpen = true;
    },
};

export default {
    namespaced: true,
    state,
    getters,
    actions,
    mutations
  }