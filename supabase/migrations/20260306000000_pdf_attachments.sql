-- PDF attachments: store extracted text for chat context
ALTER TABLE public.chat_attachments
ADD COLUMN IF NOT EXISTS text_content text;
