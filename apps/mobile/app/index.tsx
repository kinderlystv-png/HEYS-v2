import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>HEYS Mobile</Text>
      <Link href="/auth/login" style={{ marginTop: 24 }}>
        <Text style={{ color: 'blue' }}>→ Авторизация</Text>
      </Link>
    </View>
  );
}
