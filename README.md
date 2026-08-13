# MSGNEX

MSGNEX, firmaların kendi SMS sağlayıcı hesaplarını bağlayarak toplu SMS, kampanya, rehber, şablon, raporlama ve API operasyonlarını tek panelden yönetmesini sağlayan kurumsal iletişim platformudur.

Canlı beta: https://msgnex.com

## Production proxy header notu

Public endpoint rate limit anahtarları istemci IP adresinden türetilir. Production ortamında yalnız güvenilir edge/proxy tarafından set edilen header kullanılmalıdır. Varsayılan header `x-forwarded-for` değeridir; farklı bir edge kullanılıyorsa `TRUSTED_PROXY_HEADER` env değeri örneğin `x-real-ip` veya `cf-connecting-ip` olarak ayarlanabilir. Header değeri geçerli IP formatında değilse sistem `"unknown"` bucket'ına düşer.
