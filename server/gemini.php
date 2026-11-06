<?php
declare(strict_types=1);

function geminiRequest(array $payload): array {
    $contract = openaiRequest($payload, 'unused');
    return [
        'systemInstruction'=>['parts'=>[['text'=>$contract['instructions']]]],
        'contents'=>[['role'=>'user', 'parts'=>[['text'=>$contract['input']]]]],
        'generationConfig'=>[
            'maxOutputTokens'=>2048,
            'responseMimeType'=>'application/json',
            'responseJsonSchema'=>$contract['text']['format']['schema']
        ]
    ];
}
function decodeGeminiResponse(array $response, array $context): array {
    $candidate = $response['candidates'][0] ?? [];
    if (!empty($response['promptFeedback']['blockReason']) || ($candidate['finishReason'] ?? '') !== 'STOP') {
        throw new RuntimeException('O Gemini não concluiu a resposta. Reformula a pergunta ou tenta um pedido mais curto.');
    }
    $text = '';
    foreach ($candidate['content']['parts'] ?? [] as $part) {
        if (empty($part['thought']) && is_string($part['text'] ?? null)) { $text .= $part['text']; }
    }
    return validateAiAnswer($text, $context);
}
function geminiFailure(int $status, array $response = [], int $transportError = 0): string {
    // Never echo provider messages: they can contain credentials or request contents.
    foreach ($response['error']['details'] ?? [] as $detail) {
        if (in_array($detail['reason'] ?? '', ['API_KEY_INVALID', 'API_KEY_EXPIRED'], true)) {
            return 'A chave Gemini é inválida ou expirou. Cria uma chave no Google AI Studio e guarda-a em Integrações.';
        }
    }
    if ($transportError === 60) { return 'Não foi possível validar o certificado do Gemini. Verifica os certificados TLS do PHP.'; }
    if ($transportError === 28) { return 'A ligação ao Gemini demorou demasiado. Tenta novamente dentro de alguns instantes.'; }
    return match ($status) {
        400 => 'O Gemini recusou o pedido. Verifica a chave, o modelo e a disponibilidade do serviço no Google AI Studio.',
        401, 403 => 'O Gemini recusou o acesso. Verifica a chave e as permissões do projeto para a Gemini API no Google AI Studio.',
        402 => 'O saldo da API Gemini é insuficiente. Verifica a faturação do projeto no Google AI Studio.',
        404 => 'O modelo Gemini não está disponível. Seleciona um modelo acessível no teu projeto em Integrações.',
        429 => 'A quota ou o limite de pedidos do Gemini foi atingido. Consulta os limites no Google AI Studio antes de repetir.',
        default => 'Não foi possível contactar o Gemini. Tenta novamente mais tarde.'
    };
}
function callGemini(array $payload): array {
    if (getenv('FORMA_TEST_MODE') === '1') { throw new RuntimeException('Chamadas externas desativadas nos testes.'); }
    $s = integrations();
    if ($s['gemini_key'] === '') { throw new RuntimeException('Configura a chave Gemini em Integrações.'); }
    if (!preg_match('/^gemini-[a-zA-Z0-9._-]+$/D', $s['gemini_model'])) { throw new RuntimeException('Modelo Gemini inválido.'); }
    $curl = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($s['gemini_model']) . ':generateContent');
    curl_setopt_array($curl, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>50,
        CURLOPT_HTTPHEADER=>['x-goog-api-key: '.$s['gemini_key'], 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS=>json_encode(geminiRequest($payload), JSON_THROW_ON_ERROR)]);
    $raw = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); $transportError = curl_errno($curl); curl_close($curl);
    $response = json_decode($raw ?: '{}', true); $response = is_array($response) ? $response : [];
    if ($raw === false || $status !== 200) { throw new RuntimeException(geminiFailure($status, $response, $transportError)); }
    return decodeGeminiResponse($response, $payload['context']);
}
function callAi(array $payload): array {
    $provider = integrations()['ai_provider'];
    // A queued request must not silently move to a different provider after settings change.
    if (($payload['provider'] ?? 'openai') !== $provider) { throw new RuntimeException('O fornecedor de IA mudou. Envia um novo pedido.'); }
    unset($payload['provider']);
    return match ($provider) {
        'gemini' => callGemini($payload),
        'openai' => callOpenai($payload),
        default => throw new RuntimeException('Fornecedor de IA inválido.')
    };
}
