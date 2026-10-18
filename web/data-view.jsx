import {createContext,useContext} from 'react';
export const DataViewContext = createContext(false);
export const useTestData = () => useContext(DataViewContext);
