from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from auth import get_current_user
from models import AIReplyRequest
from database import db
import os
import uuid
import re
from datetime import datetime, timezone

router = APIRouter()


@router.post("/suggest-reply")
async def suggest_reply(req: AIReplyRequest, current_user=Depends(get_current_user)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    rating_ctx = f"Rating: {req.rating}/5 stars" if req.rating else ""
    reviewer_ctx = f"Reviewer: {req.reviewer_name}" if req.reviewer_name else ""
    do_dont = "\n".join([f"- {r}" for r in (req.do_dont_rules or [])]) if req.do_dont_rules else ""
    do_dont_section = f"\nRules to follow:\n{do_dont}" if do_dont else ""

    # Resolve signature + SEO keywords from client settings
    signature_text = ""
    seo_keywords = []
    client_id = current_user.get("client_id")
    if client_id:
        try:
            client_doc = await db.clients.find_one(
                {"id": client_id},
                {"_id": 0, "signature": 1, "signature_enabled": 1, "seo_keywords": 1},
            )
            if client_doc:
                if client_doc.get("signature_enabled") and client_doc.get("signature"):
                    signature_text = (client_doc.get("signature") or "").strip()
                seo_keywords = [k for k in (client_doc.get("seo_keywords") or []) if isinstance(k, str) and k.strip()]
        except Exception:
            signature_text = ""

    seo_section = (
        f"\nBusiness keywords (incorporate naturally where it improves the reply): {', '.join(seo_keywords[:8])}"
        if seo_keywords else ""
    )

    system_prompt = f"""You are a professional reputation management assistant for {req.business_name or 'a business'} ({req.business_type or 'hotel/business'}).

Generate 3 distinct reply suggestions for a {req.item_type} from {req.platform}.
Tone: {req.brand_tone or 'professional'}
Language: {req.language or 'English'}
{f'Department context: {req.department_context}' if req.department_context else ''}
{do_dont_section}{seo_section}

Guidelines:
- Keep replies concise (2-4 sentences)
- Be empathetic and genuine
- For negative reviews: acknowledge the issue and offer to resolve it
- For positive reviews: express sincere gratitude
- Never make promises you cannot keep
- Sign off professionally
{"- Do NOT add a sign-off / signature line — a signature will be appended automatically." if signature_text else ""}
{"- Use the listed business keywords sparingly — only where they fit naturally; never force them in." if seo_keywords else ""}

Return EXACTLY 3 suggestions. Separate each with the delimiter: ---SUGGESTION---"""

    user_prompt = f"""{req.item_type.capitalize()} from {req.platform}:
{reviewer_ctx}
{rating_ctx}
"{req.text}"

Generate 3 professional reply suggestions."""

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ai-reply-{uuid.uuid4()}",
            system_message=system_prompt
        ).with_model("openai", "gpt-4o")

        response = await chat.send_message(UserMessage(text=user_prompt))

        suggestions = []
        if "---SUGGESTION---" in response:
            parts = response.split("---SUGGESTION---")
            for part in parts:
                cleaned = re.sub(r'^[\d]+[.)]\s*', '', part.strip(), flags=re.MULTILINE).strip()
                if cleaned:
                    suggestions.append(cleaned)
        else:
            parts = re.split(r'\n(?=\d+[.)])', response.strip())
            for part in parts:
                cleaned = re.sub(r'^\d+[.)]\s*', '', part.strip()).strip()
                if cleaned:
                    suggestions.append(cleaned)

        suggestions = [s for s in suggestions if len(s) > 20][:3]
        if not suggestions:
            suggestions = [response.strip()]

        # Append signature if enabled
        if signature_text:
            suggestions = [f"{s.rstrip()}\n\n{signature_text}" for s in suggestions]

        if client_id:
            await db.ai_logs.insert_one({
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "user_id": current_user.get("user_id"),
                "platform": req.platform,
                "item_type": req.item_type,
                "rating": req.rating,
                "suggestions_count": len(suggestions),
                "created_at": datetime.now(timezone.utc).isoformat()
            })

        return {"suggestions": suggestions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


class GenerateImageRequest(BaseModel):
    prompt: str
    number_of_images: int = 1


class ComposePostRequest(BaseModel):
    prompt: str
    platform: Optional[str] = None
    tone: Optional[str] = "engaging"
    language: Optional[str] = "English"
    include_hashtags: bool = True
    include_keywords: bool = True


@router.post("/compose-post")
async def compose_post(req: ComposePostRequest, current_user=Depends(get_current_user)):
    """Generate social-media post content from a topic prompt.
    Returns:
        {
          "content": "Post body...",
          "hashtags": ["#example", "#more"],
          "keywords": ["keyword1", "keyword2"]
        }
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as _json

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    if not req.prompt or len(req.prompt.strip()) < 3:
        raise HTTPException(status_code=400, detail="Prompt is required (min 3 chars)")

    # Resolve business context + saved SEO keywords for personalization
    business_name = ""
    business_type = ""
    saved_seo_keywords: list[str] = []
    client_id = current_user.get("client_id")
    if client_id:
        try:
            client_doc = await db.clients.find_one(
                {"id": client_id},
                {"_id": 0, "name": 1, "business_type": 1, "seo_keywords": 1},
            )
            if client_doc:
                business_name = client_doc.get("name") or ""
                business_type = client_doc.get("business_type") or ""
                saved_seo_keywords = [
                    k for k in (client_doc.get("seo_keywords") or [])
                    if isinstance(k, str) and k.strip()
                ]
        except Exception:
            pass

    platform_hint = req.platform or "general social media"
    seo_section = (
        f"\nPriority business keywords (prefer these over generic ones; weave them in naturally): {', '.join(saved_seo_keywords[:10])}"
        if saved_seo_keywords else ""
    )

    system_prompt = f"""You are an expert social media copywriter for {business_name or 'a business'} ({business_type or 'general business'}).

Write a single social media post for {platform_hint} based on the user's topic.
Tone: {req.tone or 'engaging'}
Language: {req.language or 'English'}{seo_section}

Strict requirements:
- Body should be 60-180 words, conversational and audience-focused
- Avoid emojis at the start of every line; use them sparingly (0-3 in total) only if they help engagement
- Do NOT include hashtags inside the body — return them separately
- Do NOT prefix the body with words like "Caption:" or "Post:"
{"- The 'keywords' array MUST start with the priority business keywords listed above (still output them as a comma-list of short phrases)." if saved_seo_keywords else ""}

Return STRICTLY valid JSON (no markdown, no code fences) with this exact shape:
{{
  "content": "<post body text>",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "keywords": ["seo keyword 1", "seo keyword 2", "seo keyword 3"]
}}

Hashtags: 5-10 relevant hashtags (each starting with #, no spaces, lowercase or camelCase).
Keywords: 5-8 short SEO keywords/phrases related to the topic and business.
"""

    user_prompt = f"Topic / brief: {req.prompt.strip()}"

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ai-compose-{uuid.uuid4()}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-4o")

        response = await chat.send_message(UserMessage(text=user_prompt))

        # Strip code fences if model added them
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*", "", cleaned).strip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()

        try:
            parsed = _json.loads(cleaned)
        except Exception:
            # Fallback: try to extract JSON object substring
            match = re.search(r"\{[\s\S]*\}", cleaned)
            if not match:
                raise HTTPException(status_code=500, detail="AI returned malformed response")
            parsed = _json.loads(match.group(0))

        content = (parsed.get("content") or "").strip()
        hashtags = parsed.get("hashtags") or []
        keywords = parsed.get("keywords") or []

        # Normalize hashtags
        normalized_hashtags = []
        for h in hashtags:
            if not isinstance(h, str):
                continue
            tag = h.strip()
            if not tag:
                continue
            if not tag.startswith("#"):
                tag = "#" + tag.replace(" ", "")
            normalized_hashtags.append(tag)

        # Normalize keywords (strings only)
        normalized_keywords = [str(k).strip() for k in keywords if str(k).strip()]

        if client_id:
            try:
                await db.ai_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "client_id": client_id,
                    "user_id": current_user.get("user_id"),
                    "type": "post_compose",
                    "prompt": req.prompt.strip()[:500],
                    "platform": req.platform,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass

        return {
            "content": content,
            "hashtags": normalized_hashtags[:12] if req.include_hashtags else [],
            "keywords": normalized_keywords[:10] if req.include_keywords else [],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI compose failed: {str(e)}")


@router.post("/generate-image")
async def generate_image(req: GenerateImageRequest, current_user=Depends(get_current_user)):
    """Generate an image from a text prompt using OpenAI GPT Image 1.

    The generated image is uploaded (S3 or local fallback) and the URL
    is returned so it can be used in a post.
    """
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    from routes.upload_routes import upload_to_s3, save_locally

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")

    if not req.prompt or len(req.prompt.strip()) < 3:
        raise HTTPException(status_code=400, detail="Prompt is required (min 3 chars)")

    try:
        image_gen = OpenAIImageGeneration(api_key=api_key)
        images = await image_gen.generate_images(
            prompt=req.prompt.strip(),
            model="gpt-image-1",
            number_of_images=max(1, min(req.number_of_images, 1)),
        )

        if not images:
            raise HTTPException(status_code=500, detail="No image was generated")

        urls = []
        for image_bytes in images:
            unique_name = f"{uuid.uuid4().hex}.png"
            try:
                url = await upload_to_s3(image_bytes, unique_name, "image/png")
            except Exception:
                url = save_locally(image_bytes, unique_name)
            urls.append(url)

        client_id = current_user.get("client_id")
        if client_id:
            await db.ai_logs.insert_one({
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "user_id": current_user.get("user_id"),
                "type": "image_generation",
                "prompt": req.prompt.strip()[:500],
                "images_generated": len(urls),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        return {"urls": urls, "count": len(urls)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")
