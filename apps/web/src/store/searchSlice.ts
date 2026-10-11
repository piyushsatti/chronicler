import { createSlice } from '@reduxjs/toolkit';

export interface SearchState {
  dialogOpen: boolean;
}

const initialState: SearchState = {
  dialogOpen: false,
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    dialogOpened(state) {
      state.dialogOpen = true;
    },
    dialogClosed(state) {
      state.dialogOpen = false;
    },
  },
});

export const { dialogOpened, dialogClosed } = searchSlice.actions;
export const selectSearchDialogOpen = (state: { search: SearchState }): boolean =>
  state.search.dialogOpen;

export const searchReducer = searchSlice.reducer;
