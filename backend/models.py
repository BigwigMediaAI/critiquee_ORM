from pydantic import BaseModel, Field
from typing import Optional, List


class LoginRequest(BaseModel):
    key: str
    email: str
    password: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class ClientCreate(BaseModel):
    name: str
    business_type: str = "hotel"
    email: str
    enabled_platforms: List[str] = []
    admin_name: str
    admin_email: str
    admin_password: str


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    business_type: Optional[str] = None
    email: Optional[str] = None
    enabled_platforms: Optional[List[str]] = None
    is_active: Optional[bool] = None
    brand_tone: Optional[str] = None
    language: Optional[str] = None
    approval_required: Optional[bool] = None
    do_dont_rules: Optional[List[str]] = None
    signature: Optional[str] = None
    signature_enabled: Optional[bool] = None
    seo_keywords: Optional[List[str]] = None


class BranchCreate(BaseModel):
    name: str = Field(min_length=1)
    address: Optional[str] = None


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    brand_tone: Optional[str] = None
    language: Optional[str] = None
    approval_required: Optional[bool] = None
    do_dont_rules: Optional[List[str]] = None
    signature: Optional[str] = None
    signature_enabled: Optional[bool] = None
    seo_keywords: Optional[List[str]] = None


class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    branch_id: Optional[str] = None
    approval_required: bool = True


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    approval_required: Optional[bool] = None


class DeptUserCreate(BaseModel):
    name: str
    email: str
    password: str


class ReviewReplyRequest(BaseModel):
    reply_text: str
    post_immediately: bool = False


class AssignRequest(BaseModel):
    department_id: str
    notes: Optional[str] = None


class AIReplyRequest(BaseModel):
    platform: str
    item_type: str
    text: str
    rating: Optional[int] = None
    reviewer_name: Optional[str] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    brand_tone: Optional[str] = "professional"
    language: Optional[str] = "English"
    department_context: Optional[str] = None
    do_dont_rules: Optional[List[str]] = []


class SettingsUpdate(BaseModel):
    brand_tone: Optional[str] = None
    language: Optional[str] = None
    approval_required: Optional[bool] = None
    do_dont_rules: Optional[List[str]] = None
    reply_templates: Optional[List[dict]] = None
    google_auto_reply_enabled: Optional[bool] = None
    signature: Optional[str] = None
    signature_enabled: Optional[bool] = None
    seo_keywords: Optional[List[str]] = None


class SocialCommentReplyRequest(BaseModel):
    reply_text: str
    post_immediately: bool = False


class PostCreate(BaseModel):
    platform: str
    content: str
    location_id: Optional[str] = None
    image_urls: Optional[List[str]] = []


class ScheduledPostCreate(BaseModel):
    platforms: List[str]
    content: str
    scheduled_at: str  # ISO datetime string
    branch_id: Optional[str] = None
    image_urls: Optional[List[str]] = []


class ScheduledPostUpdate(BaseModel):
    content: Optional[str] = None
    scheduled_at: Optional[str] = None
    platforms: Optional[List[str]] = None
    status: Optional[str] = None
    image_urls: Optional[List[str]] = None


class PlatformCredentialsCreate(BaseModel):
    platform: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    api_key: Optional[str] = None
    additional_config: Optional[dict] = None


class PlatformCredentialsUpdate(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    api_key: Optional[str] = None
    additional_config: Optional[dict] = None
