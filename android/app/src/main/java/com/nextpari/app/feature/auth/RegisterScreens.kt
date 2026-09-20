package com.nextpari.app.feature.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.components.NextpariButton
import com.nextpari.app.core.ui.components.NextpariCard

@Composable
fun RegisterMenuScreen(
    onBack: () -> Unit,
    onEmail: () -> Unit,
    onPhone: () -> Unit,
    onOneClick: () -> Unit,
) {
    AuthScaffold {
        Text("Регистрация", color = Color(0xFF07182F), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text("Выберите удобный способ создания аккаунта", color = Color(0xFF64748B), fontSize = 13.sp)
        Spacer(Modifier.height(16.dp))
        NextpariCard(onClick = onOneClick) {
            Text("В один клик", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Быстрая регистрация за несколько секунд", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard(onClick = onPhone) {
            Text("По телефону", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Регистрация по номеру мобильного телефона", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Spacer(Modifier.height(10.dp))
        NextpariCard(onClick = onEmail) {
            Text("По Email", fontWeight = FontWeight.ExtraBold, color = Color(0xFF07182F))
            Text("Классическая регистрация через электронную почту", color = Color(0xFF64748B), fontSize = 13.sp)
        }
        Text(
            "Уже есть аккаунт? Войти",
            color = Color(0xFF16A34A),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 20.dp).clickable(onClick = onBack),
        )
    }
}

@Composable
fun RegisterEmailScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    RegisterFormScreen("Регистрация", "Email", KeyboardType.Email, onBack, onPrepared)
}

@Composable
fun RegisterPhoneScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    RegisterFormScreen("Регистрация по телефону", "Телефон", KeyboardType.Phone, onBack, onPrepared)
}

@Composable
fun RegisterOneClickScreen(onBack: () -> Unit, onPrepared: () -> Unit) {
    AuthScaffold {
        Text("Регистрация в один клик", color = Color(0xFF07182F), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Мы создадим ID игрока и безопасный пароль автоматически.",
            color = Color(0xFF64748B),
        )
        Spacer(Modifier.height(20.dp))
        NextpariButton(text = "Создать аккаунт", onClick = onPrepared)
        Text("Назад", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).clickable(onClick = onBack))
    }
}

@Composable
fun ForgotPasswordScreen(onBack: () -> Unit, onPlaceholder: () -> Unit) {
    AuthScaffold {
        Text("Забыли пароль?", color = Color(0xFF07182F), fontSize = 30.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text("Для восстановления пароля обратитесь в поддержку.", color = Color(0xFF64748B))
        Spacer(Modifier.height(20.dp))
        NextpariButton(text = "Понятно", onClick = onPlaceholder)
        Text("Назад", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).clickable(onClick = onBack))
    }
}

@Composable
private fun RegisterFormScreen(
    title: String,
    fieldLabel: String,
    keyboardType: KeyboardType,
    onBack: () -> Unit,
    onPrepared: () -> Unit,
) {
    var identifier by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    AuthScaffold {
        Text(title, color = Color(0xFF07182F), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp))
        Text("Укажите данные для регистрации", color = Color(0xFF64748B))
        Spacer(Modifier.height(16.dp))
        NextpariField(identifier, { identifier = it }, fieldLabel, keyboardType)
        Spacer(Modifier.height(12.dp))
        NextpariField(password, { password = it }, "Пароль", KeyboardType.Password, password = true)
        Spacer(Modifier.height(20.dp))
        NextpariButton(text = "Зарегистрироваться", onClick = onPrepared)
        Text("Назад", color = Color(0xFF16A34A), fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).clickable(onClick = onBack))
    }
}
