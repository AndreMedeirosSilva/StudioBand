import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { WebAppFrame } from './src/components/WebAppFrame';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <WebAppFrame>
        <AppNavigator />
      </WebAppFrame>
    </SafeAreaProvider>
  );
}
